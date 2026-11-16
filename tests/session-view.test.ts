import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import type {Session} from '@supabase/supabase-js';
import {createSessionReceiver} from '../lib/session-view.ts';

const view={session:null as Session|null,accessChecks:0,gate:'checking'};
const receive=createSessionReceiver<Session>(session=>{view.session=session;},()=>{view.accessChecks++;view.gate='checking';});
let userId='session-user-one',issued=0;
const events:string[]=[];
const user=()=>({id:userId,email:userId+'@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'});
const client=createClient('https://session.example.test','synthetic-publishable',{
 auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
 global:{fetch:async input=>{
  const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
  if(url.includes('/logout'))return new Response(null,{status:204});
  if(url.endsWith('/user'))return new Response(JSON.stringify(user()),{status:200,headers:{'Content-Type':'application/json'}});
  assert(url.includes('/token'),'Only synthetic Auth requests are permitted');
  const header=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
  const payload=Buffer.from(JSON.stringify({sub:userId,exp:Math.floor(Date.now()/1000)+3600,jti:String(++issued)})).toString('base64url');
  return new Response(JSON.stringify({
   access_token:header+'.'+payload+'.synthetic-signature',refresh_token:'synthetic-refresh-'+issued,
   expires_in:3600,token_type:'bearer',user:user()
  }),{status:200,headers:{'Content-Type':'application/json'}});
 }}
});
const {data:{subscription}}=client.auth.onAuthStateChange((event,session)=>{events.push(event);receive(session);});
await client.auth.getSession();
assert.equal(view.accessChecks,0);
const first=await client.auth.signInWithPassword({email:'one@example.test',password:'synthetic-password'});
assert.equal(first.error,null);assert.equal(view.accessChecks,1);
view.gate='ready';
const workspace={page:'reports',month:'2026-10',group:'G2',person:'synthetic-publisher',unsaved:'draft-not-saved'};
const originalWorkspace=JSON.stringify(workspace);
const initialToken=view.session!.access_token;
const repeated=await client.auth.signInWithPassword({email:'one@example.test',password:'synthetic-password'});
assert.equal(repeated.error,null);
assert.equal(view.accessChecks,1,'Repeated SIGNED_IN for the same account must not reset the access gate');
assert.equal(view.gate,'ready','The mounted workspace remains ready');
assert.notEqual(view.session!.access_token,initialToken,'Session tokens still update');
receive((await client.auth.getSession()).data.session);
assert.equal(view.accessChecks,1,'The startup getSession callback cannot duplicate the access check');
const refreshed=await client.auth.refreshSession();
assert.equal(refreshed.error,null);
assert.equal(view.accessChecks,1,'TOKEN_REFRESHED keeps the workspace mounted');
assert.equal(JSON.stringify(workspace),originalWorkspace);
assert(events.filter(event=>event==='SIGNED_IN').length>=2);
assert(events.includes('TOKEN_REFRESHED'));
view.gate='change';
receive(refreshed.data.session);
assert.equal(view.gate,'change','A repeated session cannot bypass a required password change');
const signedOut=await client.auth.signOut({scope:'local'});
assert.equal(signedOut.error,null);assert.equal(view.session,null);assert.equal(view.accessChecks,2);
const nextLogin=await client.auth.signInWithPassword({email:'one@example.test',password:'synthetic-password'});
assert.equal(nextLogin.error,null);assert.equal(view.accessChecks,3,'A fresh login after sign-out verifies access again');
userId='session-user-two';
const switched=await client.auth.signInWithPassword({email:'two@example.test',password:'synthetic-password'});
assert.equal(switched.error,null);assert.equal(view.accessChecks,4,'A different account resets the access gate');
assert.equal(view.gate,'checking');assert.equal((view.session as Session|null)!.user.id,userId);
subscription.unsubscribe();
console.log('PASS: SDK sign-in events, token renewal, duplicate session callbacks, password gate, sign-out and account changes preserve or reset the workspace appropriately.');
