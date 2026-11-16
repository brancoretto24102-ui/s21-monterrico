import {useEffect,useId,useMemo,useRef,useState} from 'react';
import type {KeyboardEvent} from 'react';
import {Check,ChevronDown} from 'lucide-react';
import {filterSearchOptions} from '../lib/search-options';
import type {SearchOption} from '../lib/search-options';

type Props={value:string;options:SearchOption[];onChange:(value:string)=>void};
export function PublisherSearch({value,options,onChange}:Props){
 const id=useId(),listId=id+'-list',root=useRef<HTMLDivElement>(null),input=useRef<HTMLInputElement>(null);
 const [open,setOpen]=useState(false),[query,setQuery]=useState<string|null>(null),[highlight,setHighlight]=useState<string|null>(null);
 const selected=options.find(option=>option.value===value);
 const matches=useMemo(()=>filterSearchOptions(options,query??''),[options,query]);
 const activeIndex=Math.max(0,matches.findIndex(option=>option.value===(highlight??value)));
 const showList=open&&matches.length>0;
 const close=()=>{setOpen(false);setQuery(null);setHighlight(null);};
 const choose=(option:SearchOption)=>{input.current?.focus();onChange(option.value);close();};
 useEffect(()=>{
  if(showList)document.getElementById(id+'-option-'+activeIndex)?.scrollIntoView({block:'nearest'});
 },[showList,activeIndex,id,query]);
 useEffect(()=>{
  if(!open)return;
  const dismiss=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node)){setOpen(false);setQuery(null);setHighlight(null);}};
  document.addEventListener('pointerdown',dismiss);
  return()=>document.removeEventListener('pointerdown',dismiss);
 },[open]);
 function keyDown(event:KeyboardEvent<HTMLInputElement>){
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){
   event.preventDefault();setOpen(true);
   if(!matches.length)return;
   const step=event.key==='ArrowDown'?1:-1;
   const next=open?(activeIndex+step+matches.length)%matches.length:step===1?0:matches.length-1;
   setHighlight(matches[next].value);
  }else if(event.key==='Enter'&&open){
   event.preventDefault();if(matches[activeIndex])choose(matches[activeIndex]);
  }else if(event.key==='Escape'&&open){
   event.preventDefault();event.stopPropagation();close();
  }
 }
 return <div ref={root} className="field publisher-filter" onBlur={event=>{if(!root.current?.contains(event.relatedTarget as Node|null))close();}}>
  <label htmlFor={id}>Publicador</label>
  <div className="publisher-combobox">
   <input ref={input} id={id} type="text" role="combobox" autoComplete="off" spellCheck={false}
    aria-autocomplete="list" aria-haspopup="listbox" aria-expanded={showList}
    aria-controls={showList?listId:undefined} aria-activedescendant={showList?id+'-option-'+activeIndex:undefined}
    placeholder="Todos los publicadores" value={query??selected?.label??''}
    onFocus={event=>{setOpen(true);if(query===null)event.currentTarget.select();}}
    onClick={event=>{setOpen(true);if(query===null)event.currentTarget.select();}}
    onChange={event=>{setQuery(event.target.value);setOpen(true);setHighlight(null);}} onKeyDown={keyDown}/>
   <button type="button" tabIndex={-1} className="publisher-dropdown-toggle" aria-label={open?'Cerrar lista de publicadores':'Abrir lista de publicadores'}
    onMouseDown={event=>event.preventDefault()} onClick={()=>{input.current?.focus();if(open)close();else{setQuery(null);setHighlight(null);setOpen(true);input.current?.select();}}}><ChevronDown size={16}/></button>
   {showList&&<ul id={listId} role="listbox" aria-label="Publicadores" className="publisher-options">
    {matches.map((option,index)=><li key={option.value} id={id+'-option-'+index} role="option" aria-selected={option.value===value}
     className={index===activeIndex?'highlighted':''} onMouseMove={()=>setHighlight(option.value)}
     onMouseDown={event=>event.preventDefault()} onClick={()=>choose(option)}>
     <span>{option.label}</span>{option.value===value&&<Check size={14} aria-hidden="true"/>}
    </li>)}
   </ul>}
  </div>
  <span className="publisher-search-status" role="status" aria-live="polite">{open?(matches.length?matches.length+' opciones disponibles.':'Sin coincidencias.'):''}</span>
 </div>;
}
