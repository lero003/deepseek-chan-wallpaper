import test from 'node:test';
import assert from 'node:assert/strict';
import { GameInput } from '../src/app-web/game-input.ts';
import { keyIntent } from '../src/fighters/input.ts';

test('scoped input releases modified keyup, ignores repeats/global keys, and disposes listeners',()=>{
  const saved=new Map(['document','window','Element'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  class FakeElement extends EventTarget { closest(){return this;} focus(){document.activeElement=this;} }
  const scene=new FakeElement(), doc=new EventTarget(), win=new EventTarget();
  doc.activeElement=scene;doc.hasFocus=()=>true;
  Object.defineProperties(globalThis,{document:{value:doc,configurable:true},window:{value:win,configurable:true},Element:{value:FakeElement,configurable:true}});
  const controller=new AbortController(), moves=[],actions=[],focus=[];
  const key=(type,key,properties={})=>Object.assign(new Event(type,{cancelable:true}),{key,repeat:false,metaKey:false,ctrlKey:false,altKey:false,...properties});
  try{
    const router=new GameInput(scene,{active:()=>true,movement:(x,y)=>moves.push([x,y]),action:name=>actions.push(name),pause:()=>actions.push('pause'),focus:value=>focus.push(value)},controller.signal);
    scene.dispatchEvent(key('keydown','d'));assert.deepEqual(moves.at(-1),[1,0]);
    scene.dispatchEvent(key('keyup','d',{metaKey:true}));assert.deepEqual(moves.at(-1),[0,0]);
    scene.dispatchEvent(key('keydown','a'));scene.dispatchEvent(key('keydown','Meta',{metaKey:true}));assert.deepEqual(moves.at(-1),[0,0]);
    scene.dispatchEvent(key('keydown','j'));scene.dispatchEvent(key('keydown','j',{repeat:true}));scene.dispatchEvent(key('keyup','j'));
    assert.deepEqual(actions,['attack']);
    doc.dispatchEvent(key('keydown','l'));win.dispatchEvent(key('keydown','l'));assert.deepEqual(actions,['attack']);
    scene.dispatchEvent(key('keydown','w'));win.dispatchEvent(new Event('blur'));assert.deepEqual(moves.at(-1),[0,0]);assert.equal(focus.at(-1),false);
    controller.abort();const count=moves.length;scene.dispatchEvent(key('keydown','d'));assert.equal(moves.length,count);
    router.clear();
  } finally {
    controller.abort();for(const [key,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}
  }
});
test('keyboard aliases are finite and never map browser shortcuts or free text',()=>{
  for(const key of ['j','J','z','Z'])assert.equal(keyIntent(key).action,'attack');
  for(const key of ['k','x'])assert.equal(keyIntent(key).action,'dodge');
  for(const key of ['l','c'])assert.equal(keyIntent(key).action,'special');
  assert.equal(keyIntent('ArrowLeft').direction,-1);assert.equal(keyIntent('Escape').kind,'pause');
  for(const key of ['Meta','Control','Alt','q','Tab','Enter',' '])assert.equal(keyIntent(key),null);
});
