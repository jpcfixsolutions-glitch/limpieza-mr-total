export const canRemoveContainer = row => Number(row.content) === 0 || (!row.id && !row.persistedOrigin);

export function removeDraftContainer(rows,index) {
  if (!rows[index] || !canRemoveContainer(rows[index])) return rows;
  return rows.filter((_,i)=>i!==index);
}

export function newDraftContainer(kind = 'Granel') {
  return {kind,capacity:kind==='Granel'?0:5,count:1,content:0,location:'WAREHOUSE',draft:true};
}

// El segundo recipiente nunca hereda la identidad del recipiente guardado.
export function splitDraftContainer(rows,index) {
  const row=rows[index];
  if (!row || Number(row.count)<=1) return rows;
  const content=Number(row.content)>0?Number(row.capacity):0;
  return [...rows.map((r,i)=>i===index?{...r,count:Number(r.count)-1,content:Number(r.content)-content}:r),{...row,id:undefined,draft:true,persistedOrigin:!!row.id || !!row.persistedOrigin,count:1,content}];
}
