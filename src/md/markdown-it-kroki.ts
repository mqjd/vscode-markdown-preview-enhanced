import MarkdownIt from 'markdown-it';
import { parseBlockAttributes, BlockAttributes } from '../lib';
import { FileSystemApi } from 'crossnote';
import pako from 'pako';
import * as vscode from 'vscode';
import * as path from 'path';

interface MarkdownItKrokiOptions {
  fs: FileSystemApi;
  workspace: vscode.Uri;
}

export default (md: MarkdownIt, markdownItOptions: MarkdownItKrokiOptions) => {
  const defaultRenderer = md.renderer.rules.fence.bind(md.renderer.rules);
  const asyncIds: { [key: string]: any } = {};
  md.renderer.rules.fence = async (
    tokens: any,
    idx: any,
    options: any,
    env: any,
    slf: any,
  ) => {
    const token = tokens[idx];
    const code = token.content.trim();
    const info = token.info ? md.utils.unescapeAll(token.info).trim() : '';
    const config = parseOptions(info);
    let langName = '';
    if (info) {
      langName = info.split(/\s+/g)[0];
    }
    if (langName === 'kroki') {
      if (asyncIds[idx]) {
        if (asyncIds[idx].finished) {
          const content = asyncIds[idx].content;
          delete asyncIds[idx];
          return getMarkup(content, config.lang);
        }
      } else {
        asyncIds[idx] = {
          content: readContent(code, markdownItOptions),
          config: config,
          finished: false,
        };
        return;
      }
    }
    return defaultRenderer(tokens, idx, options, env, slf);
  };

  md.core.ruler.after('linkify', 'fence', async function(state: any) {
    Promise.all(
      Object.entries(asyncIds)
        .filter((v) => !v[1].finished)
        .map(async ([idx, item]) => {
          const text = await item.content;
          item.content = text;
          item.finished = true;
        }),
    );
  });
};

const readContent = async (code: string, options: MarkdownItKrokiOptions) => {
  const filePath = path.join(options.workspace.fsPath, code);
  const isFile = await options.fs.exists(filePath);
  if (isFile) {
    return await options.fs.readFile(filePath, 'utf8');
  } else {
    return code;
  }
};

const parseOptions = (line: string) => {
  let config: BlockAttributes = {};
  let configStr = '';
  const leftParen = line.indexOf('{');
  if (leftParen > 0) {
    const rightParen = line.lastIndexOf('}');
    if (rightParen > 0) {
      configStr = line.substring(leftParen + 1, rightParen);
    }
  }
  if (configStr.length > 0) {
    try {
      config = parseBlockAttributes(configStr);
    } catch (error) {
      // null
    }
  }
  return config;
};

const getMarkup = (code: string, lang: string) => {
  const diagramSource = `digraph G {
    Hello->World
  }`;
  const data = Buffer.from(diagramSource, 'utf8');
  const compressed = pako.deflate(data, { level: 9 });
  const result = Buffer.from(compressed)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  const imgUrl = `https://kroki.io/graphviz/svg/${result}`;
  return '<img src="' + imgUrl + '" alt="kroki">\n';
};
