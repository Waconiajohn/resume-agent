// Marketing website components for FirstSourceTeam.
// Inspired by firstsourceteam.com/careers. Warm cream, Playfair display, deep-navy accent.

const Nav = () => (
  <nav style={{position:'sticky',top:0,zIndex:10,background:'rgba(252,249,245,0.9)',backdropFilter:'blur(8px)',borderBottom:'1px solid var(--fst-border)'}}>
    <div style={{maxWidth:1280,margin:'0 auto',padding:'18px 32px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
      <a href="#" style={{textDecoration:'none',display:'flex',alignItems:'center',gap:10,fontFamily:'var(--fst-font-display)',fontWeight:700,fontSize:24,letterSpacing:'-0.02em'}}>
        <span style={{color:'var(--fst-heading)'}}>FirstSource</span><span style={{color:'var(--fst-career)'}}>Team</span>
      </a>
      <div style={{display:'flex',gap:28,alignItems:'center',fontFamily:'var(--fst-font-sans)',fontSize:14,color:'var(--fst-text)'}}>
        <a href="#" style={{color:'inherit',textDecoration:'none'}}>For Employers</a>
        <a href="#" style={{color:'inherit',textDecoration:'none'}}>For Individuals</a>
        <a href="#" style={{color:'inherit',textDecoration:'none'}}>CareerIQ</a>
        <a href="#" style={{color:'inherit',textDecoration:'none'}}>About</a>
        <a href="#" style={{color:'var(--fst-accent)',fontWeight:600,textDecoration:'none'}}>Talk to Our Team →</a>
      </div>
    </div>
  </nav>
);

const Hero = () => (
  <section style={{maxWidth:1280,margin:'0 auto',padding:'96px 32px 64px',display:'grid',gridTemplateColumns:'1.15fr 1fr',gap:64,alignItems:'center'}}>
    <div>
      <div className="fst-eyebrow" style={{marginBottom:20}}>Outplacement, rebuilt</div>
      <h1 style={{fontFamily:'var(--fst-font-display)',fontWeight:500,fontSize:'clamp(2.5rem,5.5vw,4rem)',lineHeight:1.05,letterSpacing:'-0.03em',color:'var(--fst-heading)',margin:0}}>
        The first outplacement firm built for the people who use&nbsp;it.
      </h1>
      <p style={{fontFamily:'var(--fst-font-sans)',fontSize:20,lineHeight:1.55,color:'var(--fst-muted)',marginTop:28,maxWidth:560}}>
        19 years of moving people forward. AI-powered tools. Unlimited coaching until placed — not a checkbox, a system that gets people hired.
      </p>
      <div style={{display:'flex',gap:14,marginTop:36}}>
        <button style={{background:'var(--fst-accent)',color:'var(--fst-bg)',border:0,padding:'14px 26px',borderRadius:8,fontFamily:'var(--fst-font-sans)',fontWeight:600,fontSize:15,cursor:'pointer'}}>Schedule a Conversation</button>
        <button style={{background:'transparent',color:'var(--fst-accent)',border:'1px solid var(--fst-accent)',padding:'14px 26px',borderRadius:8,fontFamily:'var(--fst-font-sans)',fontWeight:600,fontSize:15,cursor:'pointer'}}>See Our Methodology</button>
      </div>
      <Stats />
    </div>
    <div style={{position:'relative',borderRadius:16,overflow:'hidden',aspectRatio:'4/5',background:'var(--fst-bg-warm)'}}>
      <img src="../../assets/images/hero-woman.jpg" alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>
      <div style={{position:'absolute',bottom:20,left:20,right:20,background:'rgba(252,249,245,0.96)',padding:'14px 18px',borderRadius:12,display:'flex',alignItems:'center',gap:12,boxShadow:'var(--fst-shadow-md)'}}>
        <div style={{width:40,height:40,borderRadius:'50%',background:'var(--fst-career)',display:'flex',alignItems:'center',justifyContent:'center',color:'white',fontFamily:'var(--fst-font-display)',fontWeight:600}}>S</div>
        <div style={{flex:1}}>
          <div style={{fontFamily:'var(--fst-font-sans)',fontWeight:600,fontSize:14,color:'var(--fst-heading)'}}>Dedicated coach</div>
          <div style={{fontFamily:'var(--fst-font-sans)',fontSize:12,color:'var(--fst-muted)'}}>Matched to your industry and career level</div>
        </div>
      </div>
    </div>
  </section>
);

const Stats = () => (
  <div style={{display:'flex',gap:44,marginTop:48,flexWrap:'wrap'}}>
    {[
      ['4.9','174 reviews'],
      ['19 yrs','Proven methodology'],
      ['100K+','Jobseekers placed'],
    ].map(([n,l]) => (
      <div key={l}>
        <div style={{fontFamily:'var(--fst-font-display)',fontWeight:500,fontSize:40,lineHeight:1,letterSpacing:'-0.03em',color:'var(--fst-heading)'}}>{n}</div>
        <div style={{fontFamily:'var(--fst-font-sans)',fontSize:13,color:'var(--fst-muted)',marginTop:6}}>{l}</div>
      </div>
    ))}
  </div>
);

const LogoCloud = () => {
  const logos = ['ibm','google','boeing','siemens','wells-fargo','michelin','walgreens','dod'];
  return (
    <section style={{background:'var(--fst-bg-alt)',borderTop:'1px solid var(--fst-border)',borderBottom:'1px solid var(--fst-border)',padding:'40px 32px'}}>
      <div style={{maxWidth:1280,margin:'0 auto'}}>
        <div className="fst-eyebrow" style={{textAlign:'center',marginBottom:24}}>Our clients landed jobs at</div>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:24,flexWrap:'wrap',opacity:0.75}}>
          {logos.map(l => <img key={l} src={`../../assets/logos-clients/${l}.svg`} alt={l} style={{height:28}}/>)}
        </div>
      </div>
    </section>
  );
};

const Bento = () => (
  <section style={{maxWidth:1280,margin:'0 auto',padding:'96px 32px'}}>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:48,marginBottom:56,alignItems:'end'}}>
      <div>
        <div className="fst-eyebrow">What you get</div>
        <h2 style={{fontFamily:'var(--fst-font-display)',fontWeight:500,fontSize:'clamp(2rem,4vw,3rem)',letterSpacing:'-0.02em',color:'var(--fst-heading)',margin:'12px 0 0',lineHeight:1.1}}>Career services for the modern era.</h2>
      </div>
      <p style={{fontFamily:'var(--fst-font-sans)',fontSize:18,lineHeight:1.6,color:'var(--fst-muted)',maxWidth:520}}>
        Most career services hand you a template and wish you luck. We pair dedicated coaches with intelligent tooling so nothing falls through the cracks.
      </p>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'1.4fr 1fr 1fr',gridTemplateRows:'auto auto',gap:20}}>
      <div style={{gridRow:'span 2',background:'var(--fst-surface)',border:'1px solid var(--fst-border)',borderRadius:16,padding:32,display:'flex',flexDirection:'column',justifyContent:'space-between',minHeight:380}}>
        <div>
          <div style={{display:'inline-flex',alignItems:'center',gap:6,background:'var(--fst-career-bg)',color:'var(--fst-career-dark)',padding:'5px 10px',borderRadius:999,fontFamily:'var(--fst-font-sans)',fontSize:12,fontWeight:600}}>CareerIQ</div>
          <h3 style={{fontFamily:'"Bree Serif",serif',fontSize:28,color:'var(--fst-heading)',margin:'18px 0 8px'}}>Agentic AI Tooling</h3>
          <p style={{fontFamily:'var(--fst-font-sans)',fontSize:15,lineHeight:1.6,color:'var(--fst-muted)'}}>AI agents built on real methodology — not generic prompts.</p>
        </div>
        <AgentPipeline />
      </div>
      <div style={{background:'var(--fst-surface)',border:'1px solid var(--fst-border)',borderRadius:16,padding:0,overflow:'hidden',display:'flex',flexDirection:'column',minHeight:180}}>
        <img src="../../assets/images/coaching-session.jpg" alt="" style={{width:'100%',height:120,objectFit:'cover'}}/>
        <div style={{padding:'18px 22px'}}>
          <h3 style={{fontFamily:'"Bree Serif",serif',fontSize:20,color:'var(--fst-heading)',margin:0}}>1:1 Expert Coaching</h3>
          <p style={{fontFamily:'var(--fst-font-sans)',fontSize:13,lineHeight:1.55,color:'var(--fst-muted)',margin:'6px 0 0'}}>Unlimited sessions. Until placed.</p>
        </div>
      </div>
      <div style={{background:'var(--fst-surface)',border:'1px solid var(--fst-border)',borderRadius:16,padding:0,overflow:'hidden',display:'flex',flexDirection:'column',minHeight:180}}>
        <img src="../../assets/images/remote-phone.jpg" alt="" style={{width:'100%',height:120,objectFit:'cover'}}/>
        <div style={{padding:'18px 22px'}}>
          <h3 style={{fontFamily:'"Bree Serif",serif',fontSize:20,color:'var(--fst-heading)',margin:0}}>Remote & Digital-First</h3>
          <p style={{fontFamily:'var(--fst-font-sans)',fontSize:13,lineHeight:1.55,color:'var(--fst-muted)',margin:'6px 0 0'}}>Access coaching anywhere.</p>
        </div>
      </div>
      <div style={{gridColumn:'span 2',background:'var(--fst-bg-dark)',color:'var(--fst-invert)',borderRadius:16,padding:'28px 32px',minHeight:160,position:'relative',overflow:'hidden'}}>
        <img src="../../assets/images/bento-satellite.jpg" alt="" style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover',opacity:0.55}}/>
        <div style={{position:'relative',maxWidth:520}}>
          <div className="fst-eyebrow" style={{color:'#a5c6e8'}}>Live visibility</div>
          <h3 style={{fontFamily:'"Bree Serif",serif',fontSize:24,color:'#fcf9f5',margin:'10px 0 8px'}}>Live Participant Dashboard</h3>
          <p style={{fontFamily:'var(--fst-font-sans)',fontSize:14,lineHeight:1.55,color:'rgba(252,249,245,0.85)',margin:0}}>Real-time status, engagement, and spend visibility for every participant.</p>
        </div>
      </div>
    </div>
  </section>
);

const AgentPipeline = () => {
  const steps = [
    ['Intake & Parsing','done'],
    ['Finding Jobs','13 jobs found'],
    ['Research & Gap Analysis','done'],
    ['Writing Resumes','in progress'],
    ['Applying for Jobs','Awaiting user'],
  ];
  return (
    <div style={{border:'1px solid var(--fst-border)',borderRadius:12,background:'var(--fst-bg-alt)',padding:'4px 8px',fontFamily:'var(--fst-font-mono)',fontSize:12}}>
      {steps.map(([s,state], i) => (
        <div key={s} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 8px',borderBottom: i<steps.length-1 ? '1px dashed var(--fst-border)' : 'none'}}>
          <span style={{display:'flex',alignItems:'center',gap:10,color:'var(--fst-text)'}}>
            <span style={{width:8,height:8,borderRadius:999,background: state==='done'?'var(--fst-success)': state==='Awaiting user'?'var(--fst-career)':'var(--fst-warn)'}}></span>
            {s}
          </span>
          <span style={{color:'var(--fst-muted)'}}>{state}</span>
        </div>
      ))}
    </div>
  );
};

const Quote = () => (
  <section style={{background:'var(--fst-bg-warm)',padding:'96px 32px'}}>
    <div style={{maxWidth:920,margin:'0 auto',textAlign:'center'}}>
      <blockquote style={{fontFamily:'var(--fst-font-display)',fontStyle:'italic',fontSize:'clamp(1.75rem,3.5vw,2.75rem)',lineHeight:1.3,color:'var(--fst-heading)',margin:0,fontWeight:400}}>
        "That's how participants rate the world's largest outplacement firm: <span style={{color:'var(--fst-danger)',fontStyle:'normal',fontWeight:500}}>1.7/5</span>. We turn our clients into fans of us — and of you. <span style={{color:'var(--fst-career-dark)',fontStyle:'normal',fontWeight:500}}>4.9/5.</span>"
      </blockquote>
      <div style={{fontFamily:'var(--fst-font-sans)',fontSize:14,color:'var(--fst-muted)',marginTop:24,textTransform:'uppercase',letterSpacing:'0.12em',fontWeight:600}}>Read our reviews →</div>
    </div>
  </section>
);

const Features = () => (
  <section style={{maxWidth:1280,margin:'0 auto',padding:'96px 32px'}}>
    <div className="fst-eyebrow">Everything you need</div>
    <h2 style={{fontFamily:'var(--fst-font-display)',fontWeight:500,fontSize:'clamp(1.75rem,3.5vw,2.5rem)',letterSpacing:'-0.02em',color:'var(--fst-heading)',margin:'12px 0 48px',maxWidth:720,lineHeight:1.15}}>Everything you need to protect your brand.</h2>
    <div style={{display:'grid',gridTemplateColumns:'repeat(3, 1fr)',gap:32}}>
      {[
        ['Self-Service Purchasing','No MSAs. No procurement cycles. Published pricing.'],
        ['3 Core Plans, or Build Your Own','Essentials, Extended, Enterprise — or configure.'],
        ['Positive Decline Refunds','If a participant declines, you get a refund.'],
        ['Live Participant Dashboard','Real-time status, engagement, and spend visibility.'],
        ['Exportable Audit Logs','Compliance-ready records for legal, HR, and audit.'],
        ['Deployed in 48 Hours','Published pricing, one-click checkout, live in a day.'],
      ].map(([t,d]) => (
        <div key={t} style={{borderTop:'1px solid var(--fst-border)',paddingTop:20}}>
          <h3 style={{fontFamily:'"Bree Serif",serif',fontSize:22,color:'var(--fst-heading)',margin:0}}>{t}</h3>
          <p style={{fontFamily:'var(--fst-font-sans)',fontSize:15,lineHeight:1.6,color:'var(--fst-muted)',margin:'10px 0 0'}}>{d}</p>
        </div>
      ))}
    </div>
  </section>
);

const CTA = () => (
  <section style={{maxWidth:1280,margin:'0 auto',padding:'64px 32px 128px'}}>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:24}}>
      {[
        ['For Individuals','Join our free webinar and see the methodology in action.','var(--fst-surface)','var(--fst-heading)'],
        ['For Employers','See what outplacement looks like when it actually works.','var(--fst-accent)','var(--fst-bg)'],
      ].map(([eye,h,bg,fg]) => (
        <div key={eye} style={{background:bg,color:fg,borderRadius:16,padding:'48px 44px',border:'1px solid var(--fst-border)',minHeight:200,display:'flex',flexDirection:'column',justifyContent:'space-between'}}>
          <div>
            <div style={{fontFamily:'var(--fst-font-sans)',fontSize:12,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.12em',opacity:0.7}}>{eye}</div>
            <div style={{fontFamily:'var(--fst-font-display)',fontWeight:500,fontSize:32,letterSpacing:'-0.02em',margin:'14px 0 0',lineHeight:1.15}}>{h}</div>
          </div>
          <div style={{marginTop:28,fontFamily:'var(--fst-font-sans)',fontWeight:600,fontSize:14,display:'inline-flex',alignItems:'center',gap:8}}>Get started →</div>
        </div>
      ))}
    </div>
  </section>
);

const Footer = () => (
  <footer style={{background:'var(--fst-bg-alt)',borderTop:'1px solid var(--fst-border)',padding:'64px 32px 48px'}}>
    <div style={{maxWidth:1280,margin:'0 auto',display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr',gap:48}}>
      <div>
        <div style={{fontFamily:'var(--fst-font-display)',fontWeight:700,fontSize:24,letterSpacing:'-0.02em'}}>
          <span style={{color:'var(--fst-heading)'}}>FirstSource</span><span style={{color:'var(--fst-career)'}}>Team</span>
        </div>
        <div style={{fontFamily:'var(--fst-font-sans)',fontSize:14,color:'var(--fst-muted)',marginTop:10}}>A Minneapolis, MN company</div>
        <div style={{fontFamily:'var(--fst-font-mono)',fontSize:13,color:'var(--fst-text)',marginTop:16}}>hello@firstsourceteam.com<br/>(612) 268-0216</div>
      </div>
      {[
        ['For Employers',['Outplacement Programs','Program Tiers','Insights']],
        ['For Individuals',['Our Process','Client Stories','Free Webinar']],
        ['Company',['About Us','Insights','Contact','Privacy Policy']],
      ].map(([h,links]) => (
        <div key={h}>
          <div style={{fontFamily:'var(--fst-font-sans)',fontSize:12,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.12em',color:'var(--fst-heading)'}}>{h}</div>
          <ul style={{listStyle:'none',padding:0,margin:'16px 0 0'}}>
            {links.map(l => <li key={l} style={{fontFamily:'var(--fst-font-sans)',fontSize:14,color:'var(--fst-muted)',padding:'6px 0'}}>{l}</li>)}
          </ul>
        </div>
      ))}
    </div>
    <div style={{maxWidth:1280,margin:'48px auto 0',paddingTop:24,borderTop:'1px solid var(--fst-border)',fontFamily:'var(--fst-font-sans)',fontSize:12,color:'var(--fst-muted)'}}>© 2026 FirstSourceTeam. All rights reserved.</div>
  </footer>
);

Object.assign(window, { Nav, Hero, LogoCloud, Bento, Quote, Features, CTA, Footer });

// Mount inline so we run AFTER component definitions in this same file.
const App = () => (
  <>
    <Nav/>
    <Hero/>
    <LogoCloud/>
    <Bento/>
    <Quote/>
    <Features/>
    <CTA/>
    <Footer/>
  </>
);
ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
