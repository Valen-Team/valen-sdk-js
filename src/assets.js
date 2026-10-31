import { emit } from './events.js';
/** Asset loading with Node streaming downloads and the browser Cache API. */
const isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);

export class Assets {
  static async create(model, options = {}) {
    const store = new Assets();
    Object.assign(store, { model, options, local: false });
    if (isNode) {
      store.fs = await import('node:fs/promises');
      store.path = await import('node:path');
      if (/^~[\\/]/.test(model)) {
        const { homedir } = await import('node:os');
        model = store.path.join(homedir(), model.slice(2));
      }
      try {
        store.local = (await store.fs.stat(model)).isDirectory();
      } catch {}
      if (
        !store.local &&
        (store.path.isAbsolute(model) || /^[A-Za-z]:[\\/]/.test(model) || /^\.\.?[\\/]/.test(model))
      )
        throw new Error(`Local model directory does not exist: ${model}`);
      if (store.local) store.root = store.path.resolve(model);
      else {
        const { homedir } = await import('node:os');
        const { createHash } = await import('node:crypto');
        const key = createHash('sha256')
          .update(model + '@' + (options.revision ?? 'main'))
          .digest('hex');
        store.root = store.path.resolve(
          options.cacheDir ?? store.path.join(homedir(), '.cache', 'valen-sdk'),
          key
        );
      }
    }
    store.base = /^https?:\/\//.test(model)
      ? model.replace(/\/$/, '')
      : `https://huggingface.co/${model}/resolve/${encodeURIComponent(options.revision ?? 'main')}`;
    return store;
  }
  setVariant(variant) {
    this.checksums = this.options.verify ? (variant.sha256 ?? {}) : {};
    this.verified = new Map();
  }
  check(name) {
    if (
      typeof name !== 'string' ||
      !name ||
      name.startsWith('/') ||
      name.includes('\\') ||
      name.includes('\0') ||
      name.split('/').some((part) => part === '..' || part === '.' || !part) ||
      name.includes(':')
    )
      throw new Error('Invalid asset path');
  }
  url(name) {
    return this.base + '/' + name.split('/').map(encodeURIComponent).join('/');
  }
  async verifyFile(path, name) {
    const expected = this.checksums?.[name];
    if (!expected || this.verified?.get(name) === path) return;
    const { createHash } = await import('node:crypto'),
      { createReadStream } = await import('node:fs');
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    if (hash.digest('hex') !== expected) throw new Error(`Checksum mismatch: ${name}`);
    this.verified.set(name, path);
  }
  async verifyResponse(response, name) {
    const expected = this.checksums?.[name];
    if (!expected) return response;
    const bytes = await response.arrayBuffer(),
      digest = await crypto.subtle.digest('SHA-256', bytes);
    const actual = [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, '0')).join('');
    if (actual !== expected) throw new Error(`Checksum mismatch: ${name}`);
    return new Response(bytes, { status: response.status, headers: response.headers });
  }
  async file(name) {
    this.check(name);
    if (!isNode) return this.url(name);
    const path = this.path.join(this.root, name);
    let exists = false;
    try {
      exists = (await this.fs.stat(path)).isFile();
    } catch {}
    if (exists) {
      await this.verifyFile(path, name);
      return path;
    }
    if (this.local || this.options.localFilesOnly) throw new Error(`Missing local asset: ${name}`);
    emit(this.options.onEvent, { event: 'download_start', backend: 'local', asset: name });
    const response = await fetch(this.url(name), {
      signal: AbortSignal.timeout(this.options.downloadTimeout ?? 600000),
      headers: this.options.token ? { Authorization: `Bearer ${this.options.token}` } : {},
    });
    if (!response.ok) throw new Error(`Asset download failed (${response.status}): ${name}`);
    await this.fs.mkdir(this.path.dirname(path), { recursive: true });
    const temporary = path + '.' + crypto.randomUUID() + '.partial';
    const { createWriteStream } = await import('node:fs');
    const { pipeline } = await import('node:stream/promises');
    try {
      await pipeline(response.body, createWriteStream(temporary));
      await this.verifyFile(temporary, name);
      await this.fs.rename(temporary, path);
      emit(this.options.onEvent, { event: 'download_complete', backend: 'local', asset: name });
      if (this.verified?.has(name)) this.verified.set(name, path);
    } catch (error) {
      await this.fs.rm(temporary, { force: true });
      throw error;
    }
    return path;
  }
  async response(name) {
    this.check(name);
    if (isNode) return new Response(await this.fs.readFile(await this.file(name)));
    const url = this.url(name);
    const cache = typeof caches === 'undefined' ? null : await caches.open('valen-sdk-v2');
    const cached = await cache?.match(url);
    if (cached) return this.verifyResponse(cached, name);
    if (this.options.localFilesOnly) throw new Error(`Missing cached asset: ${name}`);
    emit(this.options.onEvent, { event: 'download_start', backend: 'local', asset: name });
    const downloaded = await fetch(url, {
      signal: AbortSignal.timeout(this.options.downloadTimeout ?? 600000),
      headers: this.options.token ? { Authorization: `Bearer ${this.options.token}` } : {},
    });
    if (!downloaded.ok) throw new Error(`Asset download failed (${downloaded.status}): ${name}`);
    const response = await this.verifyResponse(downloaded, name);
    if (cache) {
      try {
        await cache.put(url, response.clone());
      } catch {}
    }
    return response;
  }
  async json(name) {
    return (await this.response(name)).json();
  }
  async text(name) {
    return (await this.response(name)).text();
  }
}

export { isNode };
