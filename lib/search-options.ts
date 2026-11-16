export type SearchOption={value:string;label:string;searchText?:string};
const normalize=(text:string)=>text.normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('es').trim();
export function filterSearchOptions(options:SearchOption[],query:string):SearchOption[]{
 const words=normalize(query).split(/\s+/).filter(Boolean);
 if(!words.length)return options;
 return options.filter(option=>option.value!==''&&words.every(word=>normalize(option.label+' '+(option.searchText||'')).includes(word)));
}
