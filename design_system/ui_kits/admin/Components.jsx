// HR Admin — employer dashboard for managing outplacement participants.
// Separate surface from the participant-facing CareerIQ: more data-dense,
// uses neutral slate chrome (still on cream) to feel enterprise-appropriate.

const Ic = ({ d, size=16 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d={d}/></svg>;
const I = {
  home: 'M3 12 12 4l9 8M5 10v10h14V10',
  users: 'M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M8.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M15 3.13a4 4 0 0 1 0 7.75',
  doc: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6ZM14 3v6h6M9 13h6M9 17h4',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z',
  billing: 'M2 7h20v12H2zM2 11h20M6 15h4',
  plus: 'M12 5v14M5 12h14',
  dl: 'M12 3v12m-5-5 5 5 5-5M5 21h14',
  arrow: 'M5 12h14M12 5l7 7-7 7',
  filter: 'M3 6h18M6 12h12M10 18h4',
};

const SideNav = () => (
  <aside style={{width:220,background:'#1f2937',color:'#cbd5e1',padding:'22px 14px',height:'100vh',position:'sticky',top:0,display:'flex',flexDirection:'column',gap:4,flexShrink:0}}>
    <div style={{display:'flex',alignItems:'center',gap:10,padding:'4px 10px 22px',borderBottom:'1px solid #374151',marginBottom:10}}>
      <div style={{width:34,height:34,borderRadius:8,background:'#e8dcc6',display:'flex',alignItems:'center',justifyContent:'center',color:'#2A241C',fontFamily:'"Playfair Display",serif',fontWeight:600,fontSize:18,letterSpacing:'-0.02em'}}>F</div>
      <div>
        <div style={{fontFamily:'"Playfair Display",serif',fontSize:15,fontWeight:500,color:'#fff',letterSpacing:'-0.01em'}}>FirstSource</div>
        <div style={{fontFamily:'var(--fst-font-sans)',fontSize:11,color:'#94a3b8'}}>Employer Console</div>
      </div>
    </div>
    {[
      ['Overview','home',true],
      ['Participants','users'],
      ['Programs','doc'],
      ['Compliance','shield'],
      ['Billing','billing'],
    ].map(([label,icon,active])=>(
      <div key={label} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 12px',borderRadius:7,background: active ? '#334155':'transparent',color: active?'#fff':'#cbd5e1',fontFamily:'var(--fst-font-sans)',fontSize:14,fontWeight: active?600:500,cursor:'pointer'}}>
        <Ic d={I[icon]}/> {label}
      </div>
    ))}
    <div style={{flex:1}}/>
    <div style={{padding:12,background:'#334155',borderRadius:10,fontFamily:'var(--fst-font-sans)'}}>
      <div style={{fontSize:12,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'0.08em',fontWeight:600,marginBottom:6}}>Evernote Co.</div>
      <div style={{fontSize:14,color:'#fff',fontWeight:500}}>Q2 RIF Program</div>
      <div style={{fontSize:12,color:'#94a3b8',marginTop:2}}>Deployed 48h · Active</div>
    </div>
  </aside>
);

const TopBar = () => (
  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'24px 36px',borderBottom:'1px solid var(--fst-border)',background:'var(--fst-bg)'}}>
    <div>
      <div className="fst-eyebrow">Evernote Co. · Q2 RIF</div>
      <h1 style={{fontFamily:'"Playfair Display",serif',fontSize:30,fontWeight:500,margin:'4px 0 0',letterSpacing:'-0.02em',color:'var(--fst-heading)'}}>Program overview</h1>
    </div>
    <div style={{display:'flex',gap:10}}>
      <button style={{display:'inline-flex',alignItems:'center',gap:7,padding:'9px 14px',borderRadius:8,background:'var(--fst-surface)',border:'1px solid var(--fst-border)',fontFamily:'var(--fst-font-sans)',fontSize:13,color:'var(--fst-text)',fontWeight:500,cursor:'pointer'}}><Ic d={I.dl} size={13}/> Export audit log</button>
      <button style={{display:'inline-flex',alignItems:'center',gap:7,padding:'9px 14px',borderRadius:8,background:'var(--fst-accent)',color:'var(--fst-bg)',border:0,fontFamily:'var(--fst-font-sans)',fontSize:13,fontWeight:600,cursor:'pointer'}}><Ic d={I.plus} size={13}/> Add participants</button>
    </div>
  </div>
);

const KPI = ({ label, value, sub, tone }) => (
  <div style={{background:'var(--fst-surface)',border:'1px solid var(--fst-border)',borderRadius:14,padding:'20px 22px',flex:1,minWidth:180}}>
    <div className="fst-eyebrow">{label}</div>
    <div style={{fontFamily:'"Playfair Display",serif',fontSize:36,fontWeight:500,letterSpacing:'-0.02em',color: tone==='career'?'var(--fst-career-dark)':'var(--fst-heading)',marginTop:8,lineHeight:1}}>{value}</div>
    <div style={{fontFamily:'var(--fst-font-sans)',fontSize:12,color:'var(--fst-muted)',marginTop:6}}>{sub}</div>
  </div>
);

// Tiny pie-ish visualization
const Donut = ({ pct, color, size=76 }) => {
  const r = size/2 - 6;
  const c = 2*Math.PI*r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--fst-border)" strokeWidth="6"/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
        strokeDasharray={`${c*pct/100} ${c}`} transform={`rotate(-90 ${size/2} ${size/2})`}/>
      <text x={size/2} y={size/2+4} textAnchor="middle" fontFamily='"Playfair Display",serif' fontSize="18" fontWeight="500" fill="var(--fst-heading)">{pct}%</text>
    </svg>
  );
};

const EngagementCard = () => (
  <div style={{background:'var(--fst-surface)',border:'1px solid var(--fst-border)',borderRadius:16,padding:24,flex:2,minWidth:360}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
      <div>
        <h3 style={{fontFamily:'"Bree Serif",serif',fontSize:19,margin:0,color:'var(--fst-heading)'}}>Participant engagement</h3>
        <div style={{fontSize:13,color:'var(--fst-muted)',fontFamily:'var(--fst-font-sans)',marginTop:2}}>Last 30 days · across 42 active</div>
      </div>
      <button style={{fontSize:12,color:'var(--fst-muted)',background:'transparent',border:'1px solid var(--fst-border)',borderRadius:6,padding:'5px 10px',fontFamily:'var(--fst-font-sans)',cursor:'pointer'}}>30d ▾</button>
    </div>
    <div style={{display:'flex',gap:28,marginTop:22,flexWrap:'wrap'}}>
      {[['Activated',92,'var(--fst-career)'],['In active coaching',78,'var(--fst-success)'],['Placed',34,'var(--fst-warn)']].map(([l,p,c])=>(
        <div key={l} style={{display:'flex',gap:14,alignItems:'center'}}>
          <Donut pct={p} color={c}/>
          <div>
            <div style={{fontFamily:'var(--fst-font-sans)',fontSize:13,color:'var(--fst-muted)',fontWeight:500}}>{l}</div>
            <div style={{fontFamily:'"Playfair Display",serif',fontSize:20,color:'var(--fst-heading)',marginTop:2,fontWeight:500}}>{Math.round(42*p/100)} <span style={{fontSize:14,color:'var(--fst-muted)'}}>of 42</span></div>
          </div>
        </div>
      ))}
    </div>
    <div style={{marginTop:22,padding:'12px 14px',background:'var(--fst-bg-alt)',borderRadius:10,fontFamily:'var(--fst-font-sans)',fontSize:13,color:'var(--fst-text)'}}>
      <b style={{color:'var(--fst-career-dark)'}}>3x faster placement</b> than industry average for this cohort.
    </div>
  </div>
);

const BillingCard = () => (
  <div style={{background:'var(--fst-surface)',border:'1px solid var(--fst-border)',borderRadius:16,padding:24,flex:1,minWidth:280}}>
    <h3 style={{fontFamily:'"Bree Serif",serif',fontSize:19,margin:0,color:'var(--fst-heading)'}}>Billing this quarter</h3>
    <div style={{fontFamily:'"Playfair Display",serif',fontSize:38,color:'var(--fst-heading)',margin:'10px 0 2px',fontWeight:500,letterSpacing:'-0.02em'}}>$186,400</div>
    <div style={{fontFamily:'var(--fst-font-sans)',fontSize:12,color:'var(--fst-muted)'}}>42 seats · Extended tier</div>
    <div style={{marginTop:18,borderTop:'1px solid var(--fst-border)',paddingTop:14,display:'flex',flexDirection:'column',gap:10}}>
      {[
        ['Seats purchased','46'],
        ['Declined (refunded)','4'],
        ['Net billed','42 × $4,200'],
      ].map(([l,v])=>(
        <div key={l} style={{display:'flex',justifyContent:'space-between',fontFamily:'var(--fst-font-sans)',fontSize:13}}>
          <span style={{color:'var(--fst-muted)'}}>{l}</span>
          <span style={{color:'var(--fst-text)',fontWeight:500}}>{v}</span>
        </div>
      ))}
    </div>
    <button style={{marginTop:18,width:'100%',padding:'10px',borderRadius:8,background:'transparent',border:'1px solid var(--fst-border)',fontFamily:'var(--fst-font-sans)',fontSize:13,color:'var(--fst-text)',fontWeight:500,cursor:'pointer'}}>Download invoice →</button>
  </div>
);

const ParticipantTable = () => {
  const rows = [
    ['Sarah K.','Director, Marketing','Activated · 42 sessions','Interview','#1b4f8b'],
    ['Mike S.','VP Engineering','Activated · 38 sessions','Offer','#4a7a3d'],
    ['Priya R.','Senior PM','Onboarding','Resume draft','#9a7b2e'],
    ['James O.','Director, Finance','Activated · 24 sessions','Applying','#c45c3a'],
    ['Lena T.','Staff Designer','Declined · Refunded','—','#6D6456'],
    ['Amar V.','VP Sales','Activated · 15 sessions','Networking','#1b4f8b'],
  ];
  return (
    <div style={{background:'var(--fst-surface)',border:'1px solid var(--fst-border)',borderRadius:16,overflow:'hidden'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px 24px',borderBottom:'1px solid var(--fst-border)'}}>
        <div>
          <h3 style={{fontFamily:'"Bree Serif",serif',fontSize:19,margin:0,color:'var(--fst-heading)'}}>Participants</h3>
          <div style={{fontSize:13,color:'var(--fst-muted)',marginTop:2,fontFamily:'var(--fst-font-sans)'}}>42 active · 4 declined · sorted by last activity</div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button style={{padding:'7px 11px',borderRadius:7,background:'var(--fst-surface)',border:'1px solid var(--fst-border)',fontFamily:'var(--fst-font-sans)',fontSize:12,color:'var(--fst-text)',cursor:'pointer',display:'inline-flex',alignItems:'center',gap:6}}><Ic d={I.filter} size={13}/> Filter</button>
          <button style={{padding:'7px 11px',borderRadius:7,background:'var(--fst-surface)',border:'1px solid var(--fst-border)',fontFamily:'var(--fst-font-sans)',fontSize:12,color:'var(--fst-text)',cursor:'pointer'}}>Last 30d ▾</button>
        </div>
      </div>
      <table style={{width:'100%',borderCollapse:'collapse',fontFamily:'var(--fst-font-sans)',fontSize:14}}>
        <thead>
          <tr style={{background:'var(--fst-bg-alt)'}}>
            {['Participant','Role','Status','Current stage',''].map(h=>(
              <th key={h} style={{textAlign:'left',padding:'10px 24px',fontSize:11,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.08em',color:'var(--fst-muted)'}}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([n,r,s,stage,c],i)=>(
            <tr key={i} style={{borderTop:'1px solid var(--fst-border)'}}>
              <td style={{padding:'14px 24px'}}>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <div style={{width:30,height:30,borderRadius:'50%',background:'var(--fst-bg-warm)',border:'1px solid var(--fst-border)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:600,color:'var(--fst-heading)'}}>{n.split(' ').map(x=>x[0]).join('')}</div>
                  <span style={{color:'var(--fst-heading)',fontWeight:500}}>{n}</span>
                </div>
              </td>
              <td style={{padding:'14px 24px',color:'var(--fst-text)'}}>{r}</td>
              <td style={{padding:'14px 24px',color:'var(--fst-muted)'}}>{s}</td>
              <td style={{padding:'14px 24px'}}>
                <span style={{display:'inline-flex',alignItems:'center',gap:7}}>
                  <span style={{width:8,height:8,borderRadius:999,background:c}}/>
                  <span style={{color:'var(--fst-text)'}}>{stage}</span>
                </span>
              </td>
              <td style={{padding:'14px 24px',textAlign:'right'}}><a style={{color:'var(--fst-accent)',fontSize:13,fontWeight:600,fontFamily:'var(--fst-font-sans)',textDecoration:'none'}}>Details →</a></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const App = () => (
  <div style={{display:'flex',minHeight:'100vh',background:'var(--fst-bg)'}}>
    <SideNav/>
    <main style={{flex:1}}>
      <TopBar/>
      <div style={{padding:'24px 36px 60px',display:'flex',flexDirection:'column',gap:20}}>
        <div style={{display:'flex',gap:16,flexWrap:'wrap'}}>
          <KPI label="Total participants" value="46" sub="4 declined · 42 active"/>
          <KPI label="Placed to date" value="14" sub="34% · goal 40%" tone="career"/>
          <KPI label="Avg. time to offer" value="47d" sub="vs. 142d industry avg"/>
          <KPI label="Net promoter score" value="72" sub="24 responses"/>
        </div>
        <div style={{display:'flex',gap:16,flexWrap:'wrap'}}>
          <EngagementCard/>
          <BillingCard/>
        </div>
        <ParticipantTable/>
      </div>
    </main>
  </div>
);

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
