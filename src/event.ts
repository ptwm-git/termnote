import type {BridgeEvent} from './types';
/** Validate durable events before using them as a complete recovery source. */
export function checkedEvent(value:unknown):BridgeEvent{
  if(!value||typeof value!=='object')throw new Error('原始日志事件格式损坏');
  const e=value as Record<string,unknown>;
  const dimension=(n:unknown)=>Number.isInteger(n)&&Number(n)>=2&&Number(n)<=1000;
  let valid=Number.isInteger(e.seq)&&Number(e.seq)!==0&&typeof e.time==='string';
  switch(e.type){
    case 'start':valid&&=e.cols===undefined&&e.rows===undefined||dimension(e.cols)&&dimension(e.rows);break;
    case 'output':valid&&=typeof e.data==='string';break;
    case 'resize':valid&&=dimension(e.cols)&&dimension(e.rows);break;
    case 'exit':valid&&=e.code===undefined||e.code===null||Number.isInteger(e.code);break;
    case 'error':valid&&=typeof e.message==='string';break;
    case 'interaction':valid&&=['edit','submit','cancel'].includes(String(e.action))&&(e.data===undefined||typeof e.data==='string')&&(e.echo===undefined||typeof e.echo==='string')&&(e.inputKind===undefined||['input','operation'].includes(String(e.inputKind)))&&(e.inputLines===undefined||Number.isInteger(e.inputLines)&&Number(e.inputLines)>=1&&Number(e.inputLines)<=262144);break;
    default:valid=false;
  }
  if(!valid)throw new Error('原始日志事件格式损坏：'+String(e.type));
  return value as BridgeEvent;
}
