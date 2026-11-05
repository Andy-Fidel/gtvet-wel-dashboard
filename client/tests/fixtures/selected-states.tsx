import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../../src/index.css'
import '../../src/pages/hq-partner-tabs.css'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../src/components/ui/tabs'
import { Button } from '../../src/components/ui/button'
import { Checkbox } from '../../src/components/ui/checkbox'
import { Calendar } from '../../src/components/ui/Calendar'
import { Table, TableBody, TableRow, TableCell } from '../../src/components/ui/table'
const cases = [
 ['Settings', 'h-auto flex-wrap justify-start rounded-2xl bg-white dark:bg-slate-800 p-2 shadow-sm border border-gray-100 dark:border-slate-700', 'rounded-xl px-4 py-2.5 font-bold'],
 ['Institution Partner Directory', 'h-auto max-w-full flex-wrap justify-start rounded-xl bg-slate-100 dark:bg-slate-800 p-1', ''],
 ['Guardian Dashboard', 'grid min-h-14 w-full grid-cols-2 gap-1 rounded-2xl bg-slate-100 dark:bg-slate-800 p-1', 'min-h-11 rounded-xl font-bold'],
 ['Guardian Agreement Signing', 'grid min-h-12 w-full grid-cols-2 rounded-xl bg-slate-100 dark:bg-slate-800 p-1', 'min-h-10 rounded-lg font-bold'],
 ['Help and Support', 'bg-gray-100/70 dark:bg-slate-800 p-1 rounded-2xl inline-flex h-auto', 'rounded-xl px-5 py-2.5 font-bold'],
 ['Placements', 'bg-gray-100/50 dark:bg-slate-800 p-1 rounded-2xl mb-6 inline-flex max-w-full overflow-x-auto', 'rounded-xl px-6 py-2.5 font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-indigo-900 text-gray-500 dark:data-[state=inactive]:text-slate-300 transition-colors motion-reduce:transition-none shrink-0'],
 ['Learner Profile', 'grid grid-cols-3 bg-gray-100 dark:bg-slate-800 rounded-xl p-1', 'data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm rounded-lg text-sm font-bold'],
 ['HQ Partner Registry (local fix)', 'hq-partner-section-tabs', ''],
]
function Probe({name,children}:{name:string;children:React.ReactNode}) {return <section className="bg-card text-card-foreground" data-probe={name} style={{padding:20,border:'1px solid #dce2eb',borderRadius:12}}><h2 style={{fontSize:16,fontWeight:700,marginBottom:16}}>{name}</h2>{children}</section>}
function App(){const [selected, setSelected] = useState<Date | undefined>(new Date(2024,0,10)); return <main style={{maxWidth:1120,margin:'24px auto',padding:20,display:'grid',gap:20}}><h1>Selected-state audit · actual shared components</h1>{cases.map(([name,list,trigger])=><Probe key={name} name={name}><Tabs defaultValue="one"><TabsList aria-label={name} className={list}><TabsTrigger className={trigger} value="one">Selected section</TabsTrigger><TabsTrigger className={trigger} value="two">Other section</TabsTrigger></TabsList><TabsContent value="one">Content for selected section</TabsContent><TabsContent value="two">Content for other section</TabsContent></Tabs></Probe>)}
<Probe name="Default versus outline selection buttons"><div className="flex gap-3"><Button aria-pressed="true">Selected option</Button><Button variant="outline" aria-pressed="false">Other option</Button></div></Probe>
<Probe name="HQ Registry summary filters"><div className="flex gap-3">{[true,false].map(selected=><button key={String(selected)} aria-pressed={selected} className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-left aria-pressed:border-indigo-500 aria-pressed:bg-indigo-50 aria-pressed:ring-1 aria-pressed:ring-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"><span className="text-gray-600">{selected?'Selected':'Other'} summary filter</span></button>)}</div></Probe>
<Probe name="Institution All regions"><div className="flex gap-3"><Button variant="outline" aria-pressed="true" className="bg-amber-50 border-amber-400 text-amber-950 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-100 dark:hover:bg-amber-900">All regions</Button><Button variant="outline" aria-pressed="false">Other region</Button></div></Probe>
<Probe name="Shared Checkbox"><div className="flex gap-3"><Checkbox checked aria-label="Checked"/><Checkbox checked={false} aria-label="Unchecked"/></div></Probe>
<Probe name="Learner Register selected table row"><Table className="bg-white"><TableBody><TableRow data-state="selected"><TableCell>Selected learner</TableCell></TableRow><TableRow><TableCell>Other learner</TableCell></TableRow></TableBody></Table></Probe>
<Probe name="Shared Calendar"><Calendar mode="single" defaultMonth={new Date(2024,0,1)} selected={selected} onSelect={setSelected} /></Probe>
<Probe name="Calendar range"><Calendar mode="range" defaultMonth={new Date(2024,0,1)} selected={{from:new Date(2024,0,10),to:new Date(2024,0,12)}} /></Probe></main>}
createRoot(document.getElementById('root')!).render(<App/> )
