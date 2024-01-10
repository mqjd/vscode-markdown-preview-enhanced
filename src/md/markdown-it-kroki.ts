import MarkdownIt from 'markdown-it';
import { parseBlockAttributes, BlockAttributes } from '../lib';
import { FileSystemApi } from 'crossnote';
import pako from 'pako';
import * as vscode from 'vscode';
import * as path from 'path';

enum KrokiTokenState {
  loading,
  loaded,
  finished,
}
interface KrokiTokenLoader {
  [key: string]: {
    state: KrokiTokenState;
    content: string;
    loader: Promise<string>;
  };
}
interface MarkdownItKrokiOptions {
  fs: FileSystemApi;
  workspace: vscode.Uri;
}

export default (md: MarkdownIt, markdownItOptions: MarkdownItKrokiOptions) => {
  const defaultRenderer = md.renderer.rules.fence.bind(md.renderer.rules);
  md.renderer.rules.fence = (tokens: any, idx: any, options: any) => {
    const token = tokens[idx];
    const code = token.content.trim();
    const info = token.info ? md.utils.unescapeAll(token.info).trim() : '';
    const config = parseOptions(info);
    let langName = '';
    if (info) {
      langName = info.split(/\s+/g)[0];
    }
    if (langName === 'kroki') {
      if (options[idx]) {
        const content = options[idx];
        delete options[idx];
        return getMarkup(content, config.lang);
      } else {
        readContent(code, markdownItOptions).then((content) => {
          options[idx] = content;
          md.renderer.renderToken(tokens, idx, options);
        });
        return '<span alt="kroki" />';
      }
    } else {
      return defaultRenderer(tokens, idx, options);
    }
  };
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
  let configStr =
    line.indexOf(' ') === -1 ? line : line.substring(line.indexOf(' '));
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
  const data = Buffer.from(code, 'utf8');
  const compressed = pako.deflate(data, { level: 9 });
  const result = Buffer.from(compressed)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  const imgUrl = `https://kroki.io/${lang}/svg/${result}`;
  return '<img src="' + imgUrl + '" alt="kroki"><br/>';
};
