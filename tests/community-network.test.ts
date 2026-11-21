import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import test from 'node:test';
import {CommunityConnectionError,communityDeadline} from '../src/community-network';

test('a community deadline stops a transfer that ignores cancellation',async()=>{
  let observed:AbortSignal|undefined;
  await assert.rejects(communityDeadline(20,signal=>{
    observed=signal;
    return new Promise<never>(()=>{});
  }),{message:/超时/});
  assert.equal(observed?.aborted,true);
});

test('a cancelled community batch aborts pending transfers and does not start new ones',async()=>{
  const parent=new AbortController(),reason=new Error('batch cancelled');
  const transfer=communityDeadline(500,()=>new Promise<never>(()=>{}),parent.signal);
  parent.abort(reason);
  await assert.rejects(transfer,error=>error===reason);
  let started=false;
  await assert.rejects(communityDeadline(500,async()=>{started=true;},parent.signal),error=>error===reason);
  assert.equal(started,false);
});

test('a response that sends headers and stalls during the body also times out',async t=>{
  const server=createServer((_request,response)=>{
    response.writeHead(200,{'content-type':'application/json'});
    response.write('{');
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>{server.closeAllConnections();server.close();});
  const address=server.address();
  assert.ok(address&&typeof address==='object');
  let headersReceived=false;
  await assert.rejects(communityDeadline(1_000,async signal=>{
    const response=await fetch(`http://127.0.0.1:${address.port}`,{signal});
    headersReceived=true;
    return response.json();
  }),CommunityConnectionError);
  assert.equal(headersReceived,true);
});
