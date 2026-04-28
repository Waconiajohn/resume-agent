// CareerIQ iOS app — mobile companion for tracking applications + messaging your coach.
// Built on the iOS 26 liquid-glass frame. Keeps the warm FST cream as the scroll bg
// and uses --fst-career blue for interactive accents.

const fsBlue = '#1b4f8b';
const fsCream = '#F5EFE6';
const fsCard = '#FBF7EF';
const fsInk = '#2A241C';
const fsMuted = '#6D6456';

const Chip = ({ color, label }) => (
  <span style={{display:'inline-flex',alignItems:'center',gap:6,background:'#fff',border:'1px solid rgba(0,0,0,0.06)',padding:'4px 10px',borderRadius:999,fontSize:12,color:fsInk,fontWeight:500}}>
    <span style={{width:7,height:7,borderRadius:999,background:color}}/>
    {label}
  </span>
);

const ScreenHome = () => (
  <IOSDevice width={390} height={800} dark={false}>
    <div style={{background:fsCream,minHeight:'100%',paddingBottom:40}}>
      <div style={{paddingTop:60, padding:'60px 20px 16px'}}>
        <div style={{fontFamily:'-apple-system',fontSize:13,color:fsMuted,textTransform:'uppercase',letterSpacing:'0.08em',fontWeight:600}}>Monday, April 21</div>
        <div style={{fontFamily:'"Playfair Display", serif',fontSize:30,fontWeight:500,color:fsInk,marginTop:4,letterSpacing:'-0.02em',lineHeight:1.1}}>Good morning,<br/>Mike.</div>
      </div>

      <div style={{margin:'8px 16px 14px',padding:'16px 18px',borderRadius:18,background:fsBlue,color:'#fff',boxShadow:'0 10px 24px rgba(27,79,139,0.2)'}}>
        <div style={{fontSize:11,textTransform:'uppercase',letterSpacing:'0.1em',opacity:0.8,fontWeight:600}}>Resume Agent · live</div>
        <div style={{fontFamily:'"Bree Serif",serif',fontSize:19,marginTop:6,lineHeight:1.25}}>Found 13 new matches overnight. 3 resumes drafted.</div>
        <div style={{display:'flex',gap:8,marginTop:14}}>
          <button style={{flex:1,background:'rgba(255,255,255,0.15)',border:'1px solid rgba(255,255,255,0.3)',color:'#fff',padding:'10px',borderRadius:10,fontSize:13,fontWeight:600}}>Review</button>
          <button style={{flex:1,background:'#fff',border:0,color:fsBlue,padding:'10px',borderRadius:10,fontSize:13,fontWeight:600}}>Approve all</button>
        </div>
      </div>

      <div style={{padding:'0 16px'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',margin:'14px 4px 10px'}}>
          <div style={{fontFamily:'"Bree Serif",serif',fontSize:19,color:fsInk}}>In flight</div>
          <div style={{fontSize:13,color:fsBlue,fontWeight:600}}>See all</div>
        </div>
        {[
          ['Thoughtworks','Head of Engineering','Interview Thu 2pm',fsBlue],
          ['Stripe','VP Platform','Applied · 3d ago','#9a7b2e'],
          ['Datadog','Director, Infra','Resume drafted','#c45c3a'],
          ['HashiCorp','VP Engineering','New match','#4a7a3d'],
        ].map(([co,role,status,dot],i)=>(
          <div key={i} style={{background:fsCard,border:'1px solid rgba(0,0,0,0.05)',borderRadius:14,padding:'14px 16px',marginBottom:8,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div>
              <div style={{fontFamily:'"Bree Serif",serif',fontSize:15,color:fsInk}}>{role}</div>
              <div style={{fontSize:13,color:fsMuted,marginTop:2}}>{co}</div>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <span style={{width:8,height:8,borderRadius:999,background:dot}}/>
              <span style={{fontSize:12,color:fsInk}}>{status}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  </IOSDevice>
);

const ScreenCoach = () => (
  <IOSDevice width={390} height={800} dark={false}>
    <div style={{background:fsCream,minHeight:'100%'}}>
      <div style={{paddingTop:60,padding:'60px 20px 10px',display:'flex',alignItems:'center',gap:14}}>
        <div style={{width:52,height:52,borderRadius:999,background:'#e8dcc6',border:'1px solid rgba(0,0,0,0.08)',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'"Playfair Display",serif',fontSize:22,color:fsInk,fontWeight:500}}>A</div>
        <div style={{flex:1}}>
          <div style={{fontFamily:'"Playfair Display",serif',fontSize:22,color:fsInk,letterSpacing:'-0.01em'}}>Alyssa Bennett</div>
          <div style={{fontSize:13,color:fsMuted}}>Executive strategist · Tech</div>
        </div>
        <button style={{width:40,height:40,borderRadius:999,background:fsBlue,color:'#fff',border:0,fontSize:18}}>✓</button>
      </div>

      <div style={{padding:'12px 16px',display:'flex',flexDirection:'column',gap:10}}>
        <div style={{alignSelf:'flex-start',maxWidth:'82%',background:'#fff',padding:'10px 14px',borderRadius:'18px 18px 18px 4px',border:'1px solid rgba(0,0,0,0.05)',fontSize:15,color:fsInk,lineHeight:1.4}}>Let's walk through Thoughtworks prep on Friday. I'll send a brief tonight.</div>
        <div style={{alignSelf:'flex-start',fontSize:11,color:fsMuted,paddingLeft:8}}>9:12 AM</div>

        <div style={{alignSelf:'flex-end',maxWidth:'82%',background:fsBlue,color:'#fff',padding:'10px 14px',borderRadius:'18px 18px 4px 18px',fontSize:15,lineHeight:1.4}}>Perfect. Should I re-read their engineering blog?</div>

        <div style={{alignSelf:'flex-start',maxWidth:'82%',background:'#fff',padding:'10px 14px',borderRadius:'18px 18px 18px 4px',border:'1px solid rgba(0,0,0,0.05)',fontSize:15,color:fsInk,lineHeight:1.4}}>Yes — focus on the last 6 months. Also: book lunch with Priya from your network before Friday.</div>

        <div style={{alignSelf:'flex-start',background:'#fff',padding:'14px 16px',borderRadius:18,border:'1px solid rgba(0,0,0,0.05)',marginTop:4,maxWidth:'90%'}}>
          <div style={{fontSize:11,textTransform:'uppercase',letterSpacing:'0.08em',color:fsMuted,fontWeight:600}}>Prep brief attached</div>
          <div style={{fontFamily:'"Bree Serif",serif',fontSize:16,color:fsInk,marginTop:4}}>Thoughtworks · Head of Eng</div>
          <div style={{fontSize:13,color:fsMuted,marginTop:2}}>PDF · 4 pages · Added today</div>
        </div>
      </div>

      <div style={{position:'absolute',bottom:48,left:16,right:16,background:'#fff',borderRadius:22,border:'1px solid rgba(0,0,0,0.06)',padding:'10px 14px',display:'flex',alignItems:'center',gap:10,boxShadow:'0 6px 20px rgba(0,0,0,0.05)'}}>
        <div style={{flex:1,fontSize:15,color:fsMuted}}>Message Alyssa…</div>
        <div style={{width:32,height:32,borderRadius:999,background:fsBlue,color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16}}>↑</div>
      </div>
    </div>
  </IOSDevice>
);

const ScreenJob = () => (
  <IOSDevice width={390} height={800} dark={false}>
    <div style={{background:fsCream,minHeight:'100%'}}>
      <div style={{paddingTop:60,padding:'60px 20px 16px'}}>
        <div style={{fontSize:13,color:fsBlue,fontWeight:600,marginBottom:4}}>← Back to matches</div>
        <div style={{display:'flex',gap:12,alignItems:'center',marginTop:8}}>
          <div style={{width:48,height:48,borderRadius:10,background:'#111',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:18}}>Tw</div>
          <div>
            <div style={{fontSize:13,color:fsMuted}}>Thoughtworks</div>
            <div style={{fontFamily:'"Playfair Display",serif',fontSize:24,color:fsInk,lineHeight:1.1,fontWeight:500}}>Head of Engineering</div>
          </div>
        </div>
        <div style={{display:'flex',gap:8,marginTop:14}}>
          <Chip color="#4a7a3d" label="94% match"/>
          <Chip color={fsBlue} label="Remote"/>
          <Chip color="#9a7b2e" label="$340k+"/>
        </div>
      </div>

      <div style={{padding:'0 16px',display:'flex',flexDirection:'column',gap:10}}>
        <div style={{background:fsCard,borderRadius:16,padding:'16px 18px',border:'1px solid rgba(0,0,0,0.05)'}}>
          <div style={{fontSize:11,textTransform:'uppercase',letterSpacing:'0.08em',color:fsMuted,fontWeight:600,marginBottom:8}}>Why it's a match</div>
          <div style={{fontSize:14,color:fsInk,lineHeight:1.5}}>Your platform rebuild at Evernote and consulting background map directly to the role's requirements. Their new CTO prioritizes experience leaders.</div>
        </div>

        <div style={{background:fsCard,borderRadius:16,padding:'16px 18px',border:'1px solid rgba(0,0,0,0.05)'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
            <div style={{fontSize:11,textTransform:'uppercase',letterSpacing:'0.08em',color:fsMuted,fontWeight:600}}>Resume Agent draft</div>
            <div style={{fontSize:12,color:'#4a7a3d',fontWeight:600}}>● Ready</div>
          </div>
          <div style={{fontFamily:'"Bree Serif",serif',fontSize:15,color:fsInk,lineHeight:1.3}}>Rewritten to emphasize consulting + platform leadership</div>
          <div style={{display:'flex',gap:8,marginTop:12}}>
            <button style={{flex:1,padding:'10px',borderRadius:10,background:'#fff',border:'1px solid rgba(0,0,0,0.1)',fontSize:13,fontWeight:600,color:fsInk}}>Preview</button>
            <button style={{flex:1,padding:'10px',borderRadius:10,background:fsBlue,border:0,color:'#fff',fontSize:13,fontWeight:600}}>Submit</button>
          </div>
        </div>

        <div style={{background:fsCard,borderRadius:16,padding:'16px 18px',border:'1px solid rgba(0,0,0,0.05)'}}>
          <div style={{fontSize:11,textTransform:'uppercase',letterSpacing:'0.08em',color:fsMuted,fontWeight:600,marginBottom:8}}>Your network</div>
          <div style={{fontSize:14,color:fsInk,lineHeight:1.5}}><b>Priya Chen</b> works here — Director of Platform. You overlapped at Evernote 2017-2019.</div>
          <button style={{marginTop:10,fontSize:13,color:fsBlue,fontWeight:600,background:'transparent',border:0,padding:0}}>Draft an intro message →</button>
        </div>
      </div>
    </div>
  </IOSDevice>
);

const App = () => (
  <div style={{display:'flex',gap:40,padding:'60px 40px',background:'#EFE7D6',minHeight:'100vh',justifyContent:'center',alignItems:'flex-start',flexWrap:'wrap'}}>
    {[['Home',ScreenHome],['Job detail',ScreenJob],['Coach chat',ScreenCoach]].map(([label,Comp])=>(
      <div key={label} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:14}}>
        <Comp/>
        <div style={{fontFamily:'"Playfair Display",serif',fontSize:16,color:fsInk}}>{label}</div>
      </div>
    ))}
  </div>
);

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
