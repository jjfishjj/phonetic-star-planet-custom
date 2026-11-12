import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {load,publicKey}=require('../public-catalog.js');
const config={supabaseUrl:'https://example.supabase.co',supabaseAnonKey:'sb_publishable_test'};
test('accepts only public keys',()=>{
 assert.equal(publicKey('sb_secret_test'),false);
 const token=role=>'x.'+btoa(JSON.stringify({role}))+'.x';
 assert.equal(publicKey(token('anon')),true);
 assert.equal(publicKey(token('service_role')),false);
});
test('loads all paginated cards and never carries user credentials',async()=>{
 const requests=[];
 const d={id:'en',name:'英語',native:'English',region:'europe',lang:'en-US',position:0};
 const fetcher=async(url,options)=>{requests.push({url,options});const u=new URL(url);const rows=u.pathname.endsWith('phonetic_decks')?[d]:Array.from({length:u.searchParams.get('offset')==='0'?1000:200},(_,i)=>({id:`id-${Number(u.searchParams.get('offset'))+i}`,deck_id:'en',word:'w',hint:'h',meaning:'m',topic:'food',difficulty:2}));return {ok:true,json:async()=>rows};};
 const decks=await load(config,fetcher);assert.equal(decks[0].cards.length,1200);
 assert.equal(decks[0].cards[0].topic,'food');assert.equal(decks[0].cards[0].difficulty,2);
 const cardRequest=requests.find(r=>r.url.includes('phonetic_cards'));assert.match(new URL(cardRequest.url).searchParams.get('select'),/topic,difficulty/);
 assert.equal(requests.length,3);
 for(const r of requests){assert.equal(r.options.credentials,'omit');assert.equal(r.options.headers.Authorization,undefined);assert.equal(new URL(r.url).searchParams.get('published'),'eq.true');}
});
test('fails safely instead of returning partial/duplicate data',async()=>{
 await assert.rejects(()=>load(config,async()=>({ok:false})),/failed/);
 await assert.rejects(()=>load(config,async()=>({ok:true,json:async()=>[{id:'a'},{id:'a'}]})),/Inconsistent/);
});
