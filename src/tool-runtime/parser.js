import { findExternalToolByName } from './registry.js';

export function stripFunctionCallMarkup(text, trim = true) {
  if (!text) return text;
  const cleaned = text
    .replace(/<function_calls>[\s\S]*?<\/function_calls>/g, '')
    .replace(/<\/?function_calls>/g, '')
    .replace(/<function=\w+>[\s\S]*?<\/function>/g, '')
    .replace(/<parameter=\w+>[\s\S]*?<\/parameter>/g, '')
    .replace(/<tool_name>[\s\S]*?<\/tool_name>/g, '')
    .replace(/<parameters>[\s\S]*?<\/parameters>/g, '')
    .replace(/<\/?(tool_name|parameters)>/g, '');
  return trim ? cleaned.trim() : cleaned;
}

/**
 * Parse MiMo-style XML function calls:
 *   <function=bash>
 *   <parameter=command>date</parameter>
 *   </function>
 *
 * Returns array of { id, type, function: { name, arguments } }
 */
function parseMimoXmlFunctionCalls(...chunks) {
  const matches = [];
  chunks.forEach((chunk) => {
    if (!chunk || typeof chunk !== 'string') return;

    // Format 1: <function=NAME><parameter=KEY>VALUE</parameter>...</function>
    const funcBlocks1 = chunk.matchAll(/<function=(\w+)>([\s\S]*?)<\/function>/g);
    for (const block of funcBlocks1) {
      const funcName = block[1];
      const funcBody = block[2];
      if (!funcName) continue;
      const args = {};
      const paramBlocks = funcBody.matchAll(/<parameter=(\w+)>([\s\S]*?)<\/parameter>/g);
      for (const param of paramBlocks) {
        const key = param[1];
        const value = param[2]?.trim() || '';
        args[key] = value;
      }
      matches.push({
        id: `call_${funcName}_${Date.now()}_${matches.length + 1}`,
        type: 'function',
        function: { name: funcName, arguments: JSON.stringify(args) }
      });
    }

    // Format 2: <tool_name>NAME</tool_name><parameters>...</parameters>
    //   where <parameters> contains <command>VALUE</command> or <KEY>VALUE</KEY>
    const funcBlocks2 = chunk.matchAll(/<tool_name>(\w+)<\/tool_name>([\s\S]*?)<\/parameters>/g);
    for (const block of funcBlocks2) {
      const funcName = block[1];
      const funcBody = block[2];
      if (!funcName) continue;
      // Strip leading <parameters> if present in the match
      const cleanBody = funcBody.replace(/^<parameters>/, '');
      const args = {};
      // Generic: <anykey>VALUE</anykey>
      const paramBlocks = cleanBody.matchAll(/<(\w+)>([\s\S]*?)<\/\w+>/g);
      for (const param of paramBlocks) {
        const key = param[1];
        const value = param[2]?.trim() || '';
        if (key === 'tool_name' || key === 'parameters') continue;
        args[key] = value;
      }
      // Deduplicate — if same key appears multiple times, keep last
      matches.push({
        id: `call_${funcName}_${Date.now()}_${matches.length + 1}`,
        type: 'function',
        function: { name: funcName, arguments: JSON.stringify(args) }
      });
    }
  });
  return matches;
}

/**
 * Parse OpenAI-style <function_calls>JSON</function_calls> blocks
 */
function parseStandardFunctionCalls(...chunks) {
  const matches = [];
  chunks.forEach((chunk) => {
    if (!chunk || typeof chunk !== 'string') return;
    const blocks = chunk.matchAll(/<function_calls>([\s\S]*?)<\/function_calls>/g);
    for (const block of blocks) {
      const payload = block?.[1]?.trim();
      if (!payload) continue;
      try {
        const parsed = JSON.parse(payload);
        const rawCalls = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed?.tool_calls)
            ? parsed.tool_calls
            : [parsed];
        rawCalls.forEach((rawCall, index) => {
          const name = rawCall?.function?.name || rawCall?.name;
          const rawArgs = rawCall?.function?.arguments ?? rawCall?.arguments ?? {};
          if (!name) return;
          matches.push({
            id: rawCall?.id || `call_${Date.now()}_${matches.length + index + 1}`,
            type: 'function',
            function: {
              name,
              arguments: typeof rawArgs === 'string' ? rawArgs : JSON.stringify(rawArgs)
            }
          });
        });
      } catch {
        // JSON parse failed, skip this block
      }
    }
  });
  return matches;
}

export function parseToolCallsFromText(...chunks) {
  // Try both formats: MiMo XML style AND OpenAI standard <function_calls> style
  const mimoCalls = parseMimoXmlFunctionCalls(...chunks);
  const standardCalls = parseStandardFunctionCalls(...chunks);
  return [...mimoCalls, ...standardCalls];
}

export function parseExternalToolCallsFromText(registry, ...chunks) {
  if (!Array.isArray(registry) || registry.length === 0) return [];
  const rawCalls = parseToolCallsFromText(...chunks);
  const counts = new Map();
  return rawCalls.flatMap((rawCall) => {
    const tool = findExternalToolByName(registry, rawCall?.function?.name);
    if (!tool) return [];
    const nextCount = (counts.get(tool.namespacedName) || 0) + 1;
    counts.set(tool.namespacedName, nextCount);
    return [{
      id: rawCall.id || `call_${tool.namespacedName.replace(/[^a-zA-Z0-9_]/g, '_')}_${nextCount}`,
      type: 'function',
      function: {
        name: tool.originalName,
        arguments: rawCall.function.arguments
      }
    }];
  });
}

export function createToolCallFilter({ disableTools, forceStrip = false }) {
  if (!disableTools && !forceStrip) return (chunk) => chunk;
  let inBlock = false;
  let inMimoBlock = false;
  return (chunk) => {
    if (!chunk) return chunk;
    let output = '';
    let remaining = chunk;
    while (remaining.length) {
      if (inBlock) {
        const endIdx = remaining.indexOf('</function_calls>');
        if (endIdx === -1) {
          return output;
        }
        remaining = remaining.slice(endIdx + '</function_calls>'.length);
        inBlock = false;
        continue;
      }
      if (inMimoBlock) {
        const endIdx = remaining.indexOf('</function>');
        if (endIdx === -1) {
          return output;
        }
        remaining = remaining.slice(endIdx + '</function>'.length);
        inMimoBlock = false;
        continue;
      }
      const startIdxStd = remaining.indexOf('<function_calls>');
      const startIdxMimo = remaining.indexOf('<function=');
      const firstIdx = startIdxStd === -1 ? startIdxMimo :
                        startIdxMimo === -1 ? startIdxStd :
                        Math.min(startIdxStd, startIdxMimo);
      if (firstIdx === -1) {
        output += remaining;
        return output;
      }
      output += remaining.slice(0, firstIdx);
      if (firstIdx === startIdxStd) {
        remaining = remaining.slice(firstIdx + '<function_calls>'.length);
        inBlock = true;
      } else {
        remaining = remaining.slice(firstIdx);
        inMimoBlock = true;
      }
    }
    return output;
  };
}

export function createExternalToolCallStreamParser(registry) {
  if (!Array.isArray(registry) || registry.length === 0) {
    return () => [];
  }
  const openTagStd = '<function_calls>';
  const closeTagStd = '</function_calls>';
  let buffer = '';
  return (chunk) => {
    if (!chunk) return [];
    buffer += chunk;
    const parsedCalls = [];

    // Parse standard <function_calls>...</function_calls> blocks
    while (buffer.length) {
      const startIdx = buffer.indexOf(openTagStd);
      const mimoStart = buffer.indexOf('<function=');
      const firstIdx = startIdx === -1 ? mimoStart :
                        mimoStart === -1 ? startIdx :
                        Math.min(startIdx, mimoStart);
      if (firstIdx === -1) {
        buffer = buffer.slice(-(Math.max(openTagStd.length, 10) - 1));
        break;
      }

      if (firstIdx === startIdx) {
        // Standard format
        const endIdx = buffer.indexOf(closeTagStd, startIdx + openTagStd.length);
        if (endIdx === -1) {
          buffer = buffer.slice(startIdx);
          break;
        }
        const block = buffer.slice(startIdx, endIdx + closeTagStd.length);
        parsedCalls.push(...parseExternalToolCallsFromText(registry, block));
        buffer = buffer.slice(endIdx + closeTagStd.length);
      } else {
        // MiMo XML format: <function=NAME>...</function>
        const funcMatch = buffer.slice(firstIdx).match(/<function=(\w+)>[\s\S]*?<\/function>/);
        if (!funcMatch) {
          buffer = buffer.slice(firstIdx);
          break;
        }
        const fullBlock = funcMatch[0];
        parsedCalls.push(...parseExternalToolCallsFromText(registry, fullBlock));
        buffer = buffer.slice(firstIdx + fullBlock.length);
      }
    }
    return parsedCalls;
  };
}