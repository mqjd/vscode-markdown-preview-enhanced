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

interface TokenLoader {
  [key: string]: {
    loading: boolean;
    loader: Promise<string>;
    content: string;
  };
}

export default (md: MarkdownIt, markdownItOptions: MarkdownItKrokiOptions) => {
  const defaultRenderer = md.renderer.rules.fence.bind(md.renderer.rules);
  let loadingTokens: TokenLoader = {};
  md.renderer.rules.fence = (
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
      if (loadingTokens[idx] && loadingTokens[idx].loading === false) {
        console.log(idx, '==3==');
        const dataUrl = getUrl(loadingTokens[idx]?.content, config.lang);
        loadingTokens[idx].loading = true
        return `<img src="${dataUrl}" alt="${langName}" />`;
      } else {
        console.log(idx, '==1==');
        loadingTokens[idx] = {
          loading: true,
          loader: readContent(code, markdownItOptions),
          content: '',
        };
        return `<img src="" alt="${langName}" />`;
      }
    } else {
      return defaultRenderer(tokens, idx, options, env, slf);
    }
  };
  md.core.ruler.after('block', 'kroki', async (state) => {
    const result = await Promise.all(
      Object.entries(loadingTokens).map(async ([idx, { loader }]) => {
        let code: string = await loader;
        return [+idx, code];
      }),
    );
    result.forEach(([idx, code]) => {
      loadingTokens[idx].loading = false;
      loadingTokens[idx].content = code as string;
      state.md.renderer.renderToken(state.tokens, idx, state.md.options);
    });
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

const getUrl = (code: string, lang: string) => {
  const data = Buffer.from(code, 'utf8');
  const compressed = pako.deflate(data, { level: 9 });
  const result = Buffer.from(compressed)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  const imgUrl = `https://kroki.io/${lang}/svg/${result}`;
  return imgUrl;
};
