type IdentifiedSession={user:{id:string}};

/** Repeated sign-in and token-refresh events keep the current workspace mounted. */
export function createSessionReceiver<T extends IdentifiedSession>(
 updateSession:(session:T|null)=>void,
 resetAccess:()=>void
){
 let userId:string|null=null;
 return (session:T|null)=>{
  const nextId=session?.user.id??null;
  if(nextId!==userId){userId=nextId;resetAccess();}
  updateSession(session);
 };
}
