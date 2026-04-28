// CareerIQ web app UI kit. Product surface: cooler than the marketing site,
// blue accent (--fst-career), cards on warm cream with subtle hairlines.
// The product represents AI agent tooling for job search: resume agent, job finder, applications.

const Icon = ({ d, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}>
    <path d={d}/>
  </svg>
);
const ICONS = {
  home:    'M3 12 12 4l9 8M5 10v10h14V10',
  search:  'M21 21l-5-5M10 17a7 7 0 1 1 0-14 7 7 0 0 1 0 14Z',
  file:    'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6ZM14 3v6h6',
  bot:     'M12 8V4m-4 4h8a4 4 0 0 1 4 4v4a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-4a4 4 0 0 1 4-4Zm1 6h0m6 0h0M9 18h6',
  mail:    'M4 6h16v12H4zM4 6l8 7 8-7',
  chart:   'M3 3v18h18M7 14l4-4 4 4 5-5',
  gear:    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.3l2-1.6-2-3.5-2.4.8a7.4 7.4 0 0 0-2.2-1.3L14.2 2h-4l-.5 2.1a7.4 7.4 0 0 0-2.2 1.3l-2.4-.8-2 3.5 2 1.6A7.4 7.4 0 0 0 5 12a7.4 7.4 0 0 0 .1 1.3l-2 1.6 2 3.5 2.4-.8a7.4 7.4 0 0 0 2.2 1.3l.5 2.1h4l.5-2.1a7.4 7.4 0 0 0 2.2-1.3l2.4.8 2-3.5-2-1.6a7.4 7.4 0 0 0 .1-1.3Z',
  check:   'M5 12l5 5L20 7',
  plus:    'M12 5v14M5 12h14',
  arrow:   'M5 12h14M12 5l7 7-7 7',
  clock:   'M12 7v5l3 2M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18Z',
  spark:   'M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1M5.6 18.4l2.1-2.1m8.6-8.6 2.1-2.1',
  user:    'M20 21a8 8 0 1 0-16 0M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
};

const Sidebar = ({ active, onNav }) => (
  <aside style={{width:240,background:'var(--fst-surface)',borderRight:'1px solid var(--fst-border)',padding:'20px 14px',display:'flex',flexDirection:'column',gap:4,height:'100vh',position:'sticky',top:0,flexShrink:0}}>
    <div style={{display:'flex',alignItems:'center',gap:10,padding:'6px 10px 20px'}}>
      <div style={{width:32,height:32,borderRadius:8,background:'var(--fst-career)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontFamily:'var(--fst-font-display)',fontWeight:700,fontSize:16}}>iQ</div>
      <div>
        <div style={{fontFamily:'var(--fst-font-display)',fontWeight:700,fontSize:15,color:'var(--fst-heading)',letterSpacing:'-0.01em'}}>CareerIQ</div>
        <div style={{fontFamily:'var(--fst-font-sans)',fontSize:11,color:'var(--fst-muted)'}}>by FirstSourceTeam</div>
      </div>
    </div>
    {[
      ['home','Dashboard','home'],
      ['jobs','Jobs','search'],
      ['resume','Resume Agent','bot'],
      ['apps','Applications','file'],
      ['messages','Messages','mail'],
      ['insights','Insights','chart'],
    ].map(([id, label, icon]) => (
      <button key={id} onClick={()=>onNav(id)} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderRadius:8,background: active===id ? 'var(--fst-career-bg)' : 'transparent',color: active===id ? 'var(--fst-career-dark)' : 'var(--fst-text)',border:0,fontFamily:'var(--fst-font-sans)',fontSize:14,fontWeight: active===id?600:500,cursor:'pointer',textAlign:'left',transition:'background 0.2s'}}>
        <Icon d={ICONS[icon]}/>
        {label}
      </button>
    ))}
    <div style={{flex:1}}/>
    <div style={{borderTop:'1px solid var(--fst-border)',paddingTop:12,display:'flex',alignItems:'center',gap:10}}>
      <div style={{width:32,height:32,borderRadius:'50%',background:'var(--fst-bg-warm)',border:'1px solid var(--fst-border)',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--fst-font-sans)',fontSize:12,fontWeight:600,color:'var(--fst-heading)'}}>MS</div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontFamily:'var(--fst-font-sans)',fontSize:13,fontWeight:600,color:'var(--fst-heading)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>Mike Sanders</div>
        <div style={{fontFamily:'var(--fst-font-sans)',fontSize:11,color:'var(--fst-muted)'}}>Coached by Alyssa</div>
      </div>
      <button style={{background:'transparent',border:0,color:'var(--fst-muted)',cursor:'pointer',padding:4}}><Icon d={ICONS.gear}/></button>
    </div>
  </aside>
);

const TopBar = ({ title, subtitle }) => (
  <header style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'28px 40px 20px',borderBottom:'1px solid var(--fst-border)'}}>
    <div>
      <div className="fst-eyebrow" style={{marginBottom:6}}>Monday · April 21</div>
      <h1 style={{fontFamily:'var(--fst-font-display)',fontWeight:500,fontSize:32,margin:0,letterSpacing:'-0.02em',color:'var(--fst-heading)'}}>{title}</h1>
      {subtitle && <div style={{fontFamily:'var(--fst-font-sans)',fontSize:14,color:'var(--fst-muted)',marginTop:4}}>{subtitle}</div>}
    </div>
    <div style={{display:'flex',gap:10,alignItems:'center'}}>
      <div style={{display:'flex',alignItems:'center',gap:8,background:'var(--fst-surface)',border:'1px solid var(--fst-border)',borderRadius:8,padding:'8px 12px',fontFamily:'var(--fst-font-sans)',fontSize:13,color:'var(--fst-muted)',width:260}}>
        <Icon d={ICONS.search} size={14}/> Search jobs, companies, skills…
      </div>
      <button style={{display:'inline-flex',alignItems:'center',gap:8,background:'var(--fst-accent)',color:'var(--fst-bg)',border:0,padding:'10px 16px',borderRadius:8,fontFamily:'var(--fst-font-sans)',fontWeight:600,fontSize:14,cursor:'pointer'}}>
        <Icon d={ICONS.plus} size={14}/> New application
      </button>
    </div>
  </header>
);

const StatTile = ({ label, value, delta, tone='default' }) => (
  <div style={{background:'var(--fst-surface)',border:'1px solid var(--fst-border)',borderRadius:14,padding:'20px 22px',flex:1,minWidth:180}}>
    <div className="fst-eyebrow">{label}</div>
    <div style={{display:'flex',alignItems:'baseline',gap:10,marginTop:10}}>
      <div style={{fontFamily:'var(--fst-font-display)',fontWeight:500,fontSize:36,letterSpacing:'-0.02em',color: tone==='career'?'var(--fst-career-dark)':'var(--fst-heading)'}}>{value}</div>
      {delta && <div style={{fontFamily:'var(--fst-font-mono)',fontSize:12,color:'var(--fst-success)'}}>{delta}</div>}
    </div>
  </div>
);

const AgentCard = () => {
  const [step, setStep] = React.useState(3);
  const steps = [
    ['Intake & Parsing','done'],
    ['Finding Jobs','13 jobs found'],
    ['Research & Gap Analysis','done'],
    ['Writing Resumes','in progress'],
    ['Applying for Jobs','Awaiting user'],
  ];
  React.useEffect(()=>{
    const t = setInterval(()=> setStep(s => (s+1) % steps.length), 2200);
    return () => clearInterval(t);
  },[]);
  return (
    <div style={{background:'var(--fst-surface)',border:'1px solid var(--fst-border)',borderRadius:16,padding:24,flex:2,minWidth:340}}>
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between'}}>
        <div>
          <div style={{display:'inline-flex',gap:6,alignItems:'center',background:'var(--fst-career-bg)',color:'var(--fst-career-dark)',padding:'5px 10px',borderRadius:999,fontFamily:'var(--fst-font-sans)',fontSize:11,fontWeight:600}}>
            <Icon d={ICONS.spark} size={12}/> Live
          </div>
          <h3 style={{fontFamily:'"Bree Serif",serif',fontSize:22,color:'var(--fst-heading)',margin:'12px 0 4px'}}>Resume Agent Pipeline</h3>
          <div style={{fontFamily:'var(--fst-font-sans)',fontSize:13,color:'var(--fst-muted)'}}>Working through 13 matching roles at VP+ level</div>
        </div>
        <button style={{background:'transparent',border:'1px solid var(--fst-border)',borderRadius:8,padding:'6px 12px',fontFamily:'var(--fst-font-sans)',fontSize:12,color:'var(--fst-text)',cursor:'pointer'}}>Pause</button>
      </div>
      <div style={{marginTop:18,borderTop:'1px solid var(--fst-border)'}}>
        {steps.map(([s, state], i) => (
          <div key={s} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 2px',borderBottom: i<steps.length-1 ? '1px dashed var(--fst-border)' : 'none',opacity: i>step?0.45:1,transition:'opacity 0.4s'}}>
            <div style={{display:'flex',alignItems:'center',gap:12,fontFamily:'var(--fst-font-sans)',fontSize:14,color:'var(--fst-text)'}}>
              <span style={{width:22,height:22,borderRadius:999,background: i<=step ? (state==='done'?'var(--fst-success)':state==='Awaiting user'?'var(--fst-career)':'var(--fst-warn)') : 'var(--fst-bg-alt)',border:'1px solid var(--fst-border)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff'}}>
                {i<step ? <Icon d={ICONS.check} size={12}/> : i===step ? <span style={{width:6,height:6,background:'#fff',borderRadius:999}}/> : null}
              </span>
              <span style={{fontWeight: i===step?600:500}}>{s}</span>
            </div>
            <span style={{fontFamily:'var(--fst-font-mono)',fontSize:12,color:'var(--fst-muted)'}}>{state}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const CoachCard = () => (
  <div style={{background:'var(--fst-surface)',border:'1px solid var(--fst-border)',borderRadius:16,padding:24,flex:1,minWidth:260}}>
    <div className="fst-eyebrow">Your coach</div>
    <div style={{display:'flex',gap:14,marginTop:14,alignItems:'center'}}>
      <div style={{width:56,height:56,borderRadius:'50%',background:'var(--fst-bg-warm)',border:'1px solid var(--fst-border)',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--fst-font-display)',fontWeight:600,fontSize:22,color:'var(--fst-heading)'}}>A</div>
      <div>
        <div style={{fontFamily:'var(--fst-font-display)',fontWeight:500,fontSize:18,color:'var(--fst-heading)'}}>Alyssa Bennett</div>
        <div style={{fontFamily:'var(--fst-font-sans)',fontSize:13,color:'var(--fst-muted)'}}>Executive strategist · Tech + FinServ</div>
      </div>
    </div>
    <div style={{marginTop:18,background:'var(--fst-bg-alt)',padding:'14px 16px',borderRadius:10,fontFamily:'var(--fst-font-sans)',fontSize:14,lineHeight:1.55,color:'var(--fst-text)'}}>
      "Let's spend Friday walking through your Thoughtworks prep. I'll send a brief tonight."
    </div>
    <button style={{marginTop:14,display:'inline-flex',alignItems:'center',gap:8,background:'var(--fst-accent)',color:'var(--fst-bg)',border:0,padding:'10px 16px',borderRadius:8,fontFamily:'var(--fst-font-sans)',fontWeight:600,fontSize:13,cursor:'pointer',width:'100%',justifyContent:'center'}}>
      <Icon d={ICONS.clock} size={13}/> Book next session
    </button>
  </div>
);

const JobsTable = () => {
  const jobs = [
    ['Head of Engineering','Thoughtworks','Remote','Interview scheduled','career'],
    ['VP Platform','Stripe','SF / Remote','Applied · 3d','muted'],
    ['Director, Infra','Datadog','NYC','Resume drafted','warn'],
    ['SVP Engineering','Carta','Remote','Shortlisted','career'],
    ['VP Engineering','HashiCorp','Remote','New match','success'],
  ];
  const toneColor = { career:'var(--fst-career)', muted:'var(--fst-muted)', warn:'var(--fst-warn)', success:'var(--fst-success)' };
  return (
    <div style={{background:'var(--fst-surface)',border:'1px solid var(--fst-border)',borderRadius:16,overflow:'hidden'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'18px 24px',borderBottom:'1px solid var(--fst-border)'}}>
        <div>
          <h3 style={{fontFamily:'"Bree Serif",serif',fontSize:20,margin:0,color:'var(--fst-heading)'}}>Applications in flight</h3>
          <div style={{fontFamily:'var(--fst-font-sans)',fontSize:13,color:'var(--fst-muted)',marginTop:2}}>5 active · 2 require your attention</div>
        </div>
        <button style={{fontFamily:'var(--fst-font-sans)',fontSize:13,color:'var(--fst-accent)',background:'transparent',border:0,cursor:'pointer',fontWeight:600}}>View all →</button>
      </div>
      <table style={{width:'100%',borderCollapse:'collapse',fontFamily:'var(--fst-font-sans)',fontSize:14}}>
        <thead>
          <tr style={{background:'var(--fst-bg-alt)'}}>
            {['Role','Company','Location','Status',''].map(h=>(
              <th key={h} style={{textAlign:'left',padding:'10px 24px',fontFamily:'var(--fst-font-sans)',fontSize:11,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.08em',color:'var(--fst-muted)'}}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {jobs.map(([r,c,l,s,tone],i)=>(
            <tr key={i} style={{borderTop:'1px solid var(--fst-border)'}}>
              <td style={{padding:'16px 24px',color:'var(--fst-heading)',fontWeight:500}}>{r}</td>
              <td style={{padding:'16px 24px',color:'var(--fst-text)'}}>{c}</td>
              <td style={{padding:'16px 24px',color:'var(--fst-muted)'}}>{l}</td>
              <td style={{padding:'16px 24px'}}>
                <span style={{display:'inline-flex',alignItems:'center',gap:8}}>
                  <span style={{width:8,height:8,borderRadius:999,background:toneColor[tone]}}></span>
                  <span style={{color:'var(--fst-text)'}}>{s}</span>
                </span>
              </td>
              <td style={{padding:'16px 24px',textAlign:'right'}}><button style={{background:'transparent',border:'1px solid var(--fst-border)',borderRadius:6,padding:'5px 10px',fontFamily:'var(--fst-font-sans)',fontSize:12,color:'var(--fst-text)',cursor:'pointer'}}>Open</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const Dashboard = () => (
  <main style={{flex:1,background:'var(--fst-bg)',minHeight:'100vh'}}>
    <TopBar title="Good morning, Mike." subtitle="13 new job matches. Your resume agent finished 3 drafts overnight."/>
    <div style={{padding:'24px 40px 64px',display:'flex',flexDirection:'column',gap:24}}>
      <div style={{display:'flex',gap:16,flexWrap:'wrap'}}>
        <StatTile label="Active applications" value="12" delta="+3 this week"/>
        <StatTile label="Interviews" value="2" delta="+1" tone="career"/>
        <StatTile label="Response rate" value="38%"/>
        <StatTile label="Week streak" value="4" delta="🔥"/>
      </div>
      <div style={{display:'flex',gap:16,flexWrap:'wrap'}}>
        <AgentCard/>
        <CoachCard/>
      </div>
      <JobsTable/>
    </div>
  </main>
);

const App = () => {
  const [active, setActive] = React.useState('home');
  return (
    <div style={{display:'flex',minHeight:'100vh',background:'var(--fst-bg)'}}>
      <Sidebar active={active} onNav={setActive}/>
      <Dashboard/>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
