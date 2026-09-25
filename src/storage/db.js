/* ============================================================
   一格 · IndexedDB 封装（单元2；单元6b 加图片仓）
   任务书 §3.3：所有本地操作先落 IndexedDB。
   纯 promise 化封装，不含业务逻辑（业务在 dao.js）。

   对象仓（store）规划：
   - templates  模板，主键 id
   - boxes      盒子，主键 id
   - cards      卡片，主键 id，附 boxId / updatedAt 索引
                （updatedAt 索引是任务书 §14 的硬要求，建库时就加）
   - settings   键值对（如「是否已播种」标记）
   - assets     图片本体，主键 id（单元6b）

   版本 1 → 2 只做「新增 assets」，一个字都不动老仓。
   onupgradeneeded 里每个仓都先 contains 判断，已存在的不会被重建，
   所以老版本留下的盒子 / 卡片 / 模板原样保留（任务书 §13 的精神）。
   ============================================================ */

const DB_NAME = "yige";
const DB_VERSION = 2;

let dbPromise = null;

/** 打开（或复用）数据库连接。整个应用生命周期共用一个连接。 */
export function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("templates")) {
        db.createObjectStore("templates", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("boxes")) {
        db.createObjectStore("boxes", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("cards")) {
        const cards = db.createObjectStore("cards", { keyPath: "id" });
        cards.createIndex("boxId", "boxId", { unique: false });
        cards.createIndex("updatedAt", "updatedAt", { unique: false });
      }
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings");
      }
      /* 图片本体：{ id, blob, name, type, size, createdAt }
         卡片里只存 id（见 media/image.js），图片本体单独放这里，
         这样卡片 JSON 依然是干净的短文本（任务书 §1「明文优先」）。 */
      if (!db.objectStoreNames.contains("assets")) {
        db.createObjectStore("assets", { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

/* ---------- 通用读写助手（内部） ---------- */

function tx(storeName, mode, fn) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(storeName, mode);
        const store = t.objectStore(storeName);
        const result = fn(store);
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      })
  );
}

/** 读单条请求，等 success 拿值 */
function wait(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/* ---------- 对外 API ---------- */

export const db = {
  get(storeName, key) {
    return tx(storeName, "readonly", (s) => wait(s.get(key)));
  },
  getAll(storeName) {
    return tx(storeName, "readonly", (s) => wait(s.getAll()));
  },
  put(storeName, value) {
    return tx(storeName, "readwrite", (s) => s.put(value));
  },
  /** 批量写入（一个事务，播种时用） */
  putMany(storeName, values) {
    return tx(storeName, "readwrite", (s) => {
      for (const v of values) s.put(v);
    });
  },
  delete(storeName, key) {
    return tx(storeName, "readwrite", (s) => s.delete(key));
  },
  count(storeName) {
    return tx(storeName, "readonly", (s) => wait(s.count()));
  },
  /** 按索引等值计数（如某盒子下的卡片数） */
  countByIndex(storeName, indexName, value) {
    return tx(storeName, "readonly", (s) =>
      wait(s.index(indexName).count(IDBKeyRange.only(value)))
    );
  },
  /** 设置键值对 */
  getSetting(key) {
    return open().then(
      (db_) =>
        new Promise((resolve, reject) => {
          const t = db_.transaction("settings", "readonly");
          const req = t.objectStore("settings").get(key);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        })
    );
  },
  setSetting(key, value) {
    return open().then(
      (db_) =>
        new Promise((resolve, reject) => {
          const t = db_.transaction("settings", "readwrite");
          t.objectStore("settings").put(value, key);
          t.oncomplete = () => resolve();
          t.onerror = () => reject(t.error);
        })
    );
  },
};
