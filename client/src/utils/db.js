// Minimal IndexedDB wrapper with localStorage fallback
let db = null;
let driver = "idb";
const mem = {};

export async function open(name, version, storeNames){
  if(!("indexedDB" in window)){ driver="ls"; storeNames.forEach(s=> mem[s]=readLS(s)); return; }
  db = await new Promise((resolve,reject)=>{
    const req = indexedDB.open(name, version);
    req.onupgradeneeded = e=>{
      const idb = req.result;
      storeNames.forEach(s=>{
        if(!idb.objectStoreNames.contains(s)){
          idb.createObjectStore(s, { keyPath:"id" });
        }
      });
    };
    req.onsuccess = ()=> resolve(req.result);
    req.onerror = ()=> reject(req.error);
  });
}

function readLS(store){ try{ return JSON.parse(localStorage.getItem("dsm:"+store+":v1"))||[] }catch{ return [] } }
function writeLS(store, data){ localStorage.setItem("dsm:"+store+":v1", JSON.stringify(data)); }

export async function getAll(store){
  if(driver==="ls"){ return mem[store].slice(); }
  return new Promise((res,rej)=>{
    const tx = db.transaction(store,"readonly");
    const st = tx.objectStore(store);
    const req = st.getAll();
    req.onsuccess = ()=> res(req.result||[]);
    req.onerror = ()=> rej(req.error);
  });
}

export async function get(store, id){
  if(driver==="ls"){ return mem[store].find(x=>x.id===id) || null; }
  return new Promise((res,rej)=>{
    const tx = db.transaction(store,"readonly");
    const st = tx.objectStore(store);
    const req = st.get(id);
    req.onsuccess = ()=> res(req.result||null);
    req.onerror = ()=> rej(req.error);
  });
}

export async function put(store, obj){
  if(driver==="ls"){
    const arr = mem[store];
    const i = arr.findIndex(x=>x.id===obj.id);
    if(i>=0) arr[i]=obj; else arr.push(obj);
    writeLS(store, arr);
    return obj.id;
  }
  return new Promise((res,rej)=>{
    const tx = db.transaction(store,"readwrite");
    const st = tx.objectStore(store);
    const req = st.put(obj);
    req.onsuccess = ()=> res(req.result);
    req.onerror = ()=> rej(req.error);
  });
}

export async function add(store, obj){
  if(driver==="ls"){
    mem[store].push(obj);
    writeLS(store, mem[store]);
    return obj.id;
  }
  return new Promise((res,rej)=>{
    const tx = db.transaction(store,"readwrite");
    const st = tx.objectStore(store);
    const req = st.add(obj);
    req.onsuccess = ()=> res(req.result);
    req.onerror = ()=> rej(req.error);
  });
}

export async function del(store, id){
  if(driver==="ls"){
    const arr = mem[store];
    const i = arr.findIndex(x=>x.id===id);
    if(i>=0){ arr.splice(i,1); writeLS(store, arr); }
    return;
  }
  return new Promise((res,rej)=>{
    const tx = db.transaction(store,"readwrite");
    const st = tx.objectStore(store);
    const req = st.delete(id);
    req.onsuccess = ()=> res();
    req.onerror = ()=> rej(req.error);
  });
}
