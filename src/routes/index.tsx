import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bell,
  Building2,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  ClipboardCheck,
  Database,
  FileSearch,
  Filter,
  Globe2,
  KanbanSquare,
  LayoutDashboard,
  Linkedin,
  Mail,
  MapPin,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Phone,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  X,
  Zap,
} from "lucide-react";
import { demoLeads, scoreLabel, statusOrder, type Campaign, type Lead, type LeadStatus } from "../lib/prospecting";

export const Route = createFileRoute("/")({ component: ProspectingApp });

type View = "dashboard" | "campaigns" | "new" | "leads" | "pipeline" | "diagnostics" | "messages" | "meetings" | "integrations" | "settings";

const nav: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "campaigns", label: "Campanhas", icon: Target },
  { id: "new", label: "Nova Prospecção", icon: Plus },
  { id: "leads", label: "Leads", icon: Users },
  { id: "pipeline", label: "Pipeline", icon: KanbanSquare },
  { id: "diagnostics", label: "Diagnósticos", icon: ClipboardCheck },
  { id: "messages", label: "Mensagens", icon: MessageCircle },
  { id: "meetings", label: "Reuniões", icon: Activity },
];

const extraNav: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "integrations", label: "Integrações", icon: Database },
  { id: "settings", label: "Configurações", icon: Settings2 },
];

const initialCampaign: Campaign = {
  id: "camp-demo",
  name: "Dentistas Curitiba — Agosto/2026",
  segment: "Clínicas odontológicas",
  location: "Curitiba/PR",
  radius: 30,
  quantity: 200,
  decisionMakers: ["Proprietário", "Sócio", "Diretor de Marketing"],
  offer: "Gestão de tráfego pago para clínicas odontológicas.",
  objective: "Agendar reunião",
  channels: ["WhatsApp", "Telefone", "E-mail"],
  createdAt: "16 ago 2026",
  progress: 68,
};

function ProspectingApp() {
  const [view, setView] = useState<View>("dashboard");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [campaign, setCampaign] = useState<Campaign>(initialCampaign);
  const [leads, setLeads] = useState<Lead[]>(demoLeads);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [search, setSearch] = useState("");
  const [scoreFilter, setScoreFilter] = useState("Todos");

  const filteredLeads = useMemo(() => {
    const term = search.toLowerCase();
    return leads.filter((lead) => {
      const matchesSearch = !term || `${lead.company} ${lead.city} ${lead.decisionMaker} ${lead.segment}`.toLowerCase().includes(term);
      const matchesScore = scoreFilter === "Todos" || (scoreFilter === "80+" && lead.score >= 80) || (scoreFilter === "70+" && lead.score >= 70) || (scoreFilter === "<70" && lead.score < 70);
      return matchesSearch && matchesScore;
    });
  }, [leads, search, scoreFilter]);

  const approveLead = (id: string) => {
    setLeads((current) => current.map((lead) => (lead.id === id ? { ...lead, status: "Pronto para contato" as LeadStatus } : lead)));
    setSelectedLead((current) => current ? { ...current, status: "Pronto para contato" } : current);
  };

  const navigate = (next: View) => {
    setView(next);
    setMobileOpen(false);
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><Sparkles size={17} /></div>
          <div><strong>ProspectAI</strong><span>Sales Intelligence</span></div>
          <button className="mobile-close" onClick={() => setMobileOpen(false)}><X size={18} /></button>
        </div>
        <div className="workspace"><div className="workspace-avatar">N</div><div><span>Workspace</span><strong>Nexus</strong></div><ChevronDown size={14} /></div>
        <div className="nav-group">
          <span className="nav-label">PRINCIPAL</span>
          {nav.map((item) => <NavButton key={item.id} item={item} active={view === item.id} onClick={() => navigate(item.id)} />)}
        </div>
        <div className="nav-group bottom-nav">
          <span className="nav-label">SISTEMA</span>
          {extraNav.map((item) => <NavButton key={item.id} item={item} active={view === item.id} onClick={() => navigate(item.id)} />)}
        </div>
        <div className="sidebar-footer"><ShieldCheck size={15} /><span>Dados com rastreabilidade</span></div>
      </aside>

      {mobileOpen && <div className="sidebar-overlay" onClick={() => setMobileOpen(false)} />}
      <main className="main-content">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileOpen(true)}><Menu size={20} /></button>
          <div className="breadcrumbs"><span>Workspace</span><span>/</span><strong>{viewTitle(view)}</strong></div>
          <div className="top-actions"><div className="system-pill"><span className="pulse" /> Motor operacional</div><button className="icon-button"><Bell size={18} /></button><div className="user-avatar">DS</div></div>
        </header>

        <div className="page-wrap">
          {view === "dashboard" && <Dashboard leads={leads} campaign={campaign} onNew={() => navigate("new")} onLead={setSelectedLead} />}
          {view === "new" && <NewProspection campaign={campaign} setCampaign={setCampaign} onStart={() => { setCampaign((c) => ({ ...c, progress: 12 })); navigate("campaigns"); }} />}
          {view === "campaigns" && <Campaigns campaign={campaign} onOpen={() => navigate("leads")} />}
          {view === "leads" && <Leads leads={filteredLeads} search={search} setSearch={setSearch} scoreFilter={scoreFilter} setScoreFilter={setScoreFilter} onLead={setSelectedLead} onNew={() => navigate("new")} />}
          {view === "pipeline" && <Pipeline leads={leads} onLead={setSelectedLead} />}
          {view === "diagnostics" && <Diagnostics leads={leads} onLead={setSelectedLead} />}
          {view === "messages" && <Messages leads={leads} onLead={setSelectedLead} onApprove={approveLead} />}
          {view === "meetings" && <Meetings />}
          {view === "integrations" && <Integrations />}
          {view === "settings" && <Settings />}
        </div>
      </main>
      {selectedLead && <LeadDrawer lead={selectedLead} onClose={() => setSelectedLead(null)} onApprove={approveLead} />}
    </div>
  );
}

function NavButton({ item, active, onClick }: { item: (typeof nav)[number]; active: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return <button className={`nav-button ${active ? "active" : ""}`} onClick={onClick}><Icon size={17} /><span>{item.label}</span>{item.id === "messages" && <b className="nav-count">4</b>}</button>;
}

function viewTitle(view: View) { return nav.concat(extraNav).find((item) => item.id === view)?.label ?? "Dashboard"; }

function Dashboard({ leads, campaign, onNew, onLead }: { leads: Lead[]; campaign: Campaign; onNew: () => void; onLead: (lead: Lead) => void }) {
  const avg = Math.round(leads.reduce((sum, lead) => sum + lead.score, 0) / leads.length);
  const cards = [
    ["Empresas encontradas", "200", "+18%", Building2],
    ["Empresas analisadas", "136", "+31%", FileSearch],
    ["Decisores identificados", "98", "+22%", Users],
    ["Leads prioritários", String(leads.filter((l) => l.score >= 80).length), "+14%", Zap],
  ] as const;
  return <>
    <PageHeader eyebrow="VISÃO GERAL" title="Seu próximo cliente está aqui." description="Pesquisa, inteligência e contexto comercial em um único fluxo." action={<button className="primary-button" onClick={onNew}><Plus size={17} /> Nova prospecção</button>} />
    <section className="metric-grid">{cards.map(([label, value, delta, Icon]) => <MetricCard key={label} label={label} value={value} delta={delta} icon={Icon} />)}</section>
    <div className="dashboard-grid">
      <section className="panel campaign-progress"><PanelTitle title="Campanha em andamento" action="Ver campanha" /><div className="campaign-head"><div><span className="eyebrow">ATIVA</span><h3>{campaign.name}</h3><p>{campaign.segment} · {campaign.location} · {campaign.radius} km</p></div><div className="score-ring"><strong>{campaign.progress}%</strong><span>processado</span></div></div><div className="progress"><span style={{ width: `${campaign.progress}%` }} /></div><div className="process-row"><span>Descoberta <b>200</b></span><span>Validação <b>168</b></span><span>Auditoria <b>136</b></span><span>Diagnóstico <b>136</b></span></div></section>
      <section className="panel"><PanelTitle title="Oportunidades" action="Abrir leads" /><div className="opportunity-list">{leads.slice(0, 4).map((lead) => <button key={lead.id} className="opportunity" onClick={() => onLead(lead)}><div className="company-avatar">{lead.company.slice(0, 2).toUpperCase()}</div><div className="opp-main"><strong>{lead.company}</strong><span>{lead.opportunity}</span></div><Score score={lead.score} /></button>)}</div></section>
    </div>
    <div className="dashboard-grid lower-grid">
      <section className="panel"><PanelTitle title="Performance da campanha" /><div className="funnel"><FunnelRow label="Empresas encontradas" value={200} width="100%" /><FunnelRow label="Leads válidos" value={168} width="84%" /><FunnelRow label="Analisados" value={136} width="68%" /><FunnelRow label="Aprovados" value={82} width="41%" /><FunnelRow label="Reuniões" value={12} width="16%" /></div></section>
      <section className="panel"><PanelTitle title="Cobertura de dados" /><div className="coverage"><Coverage label="Telefone" value={87} /><Coverage label="WhatsApp" value={74} /><Coverage label="E-mail" value={69} /><Coverage label="Decisor" value={49} /><Coverage label="Anúncios" value={42} /></div><div className="notice"><ShieldCheck size={15} /><span>Inferências são separadas de fatos e sempre exibem evidências.</span></div></section>
    </div>
  </>;
}

function NewProspection({ campaign, setCampaign, onStart }: { campaign: Campaign; setCampaign: React.Dispatch<React.SetStateAction<Campaign>>; onStart: () => void }) {
  const [step, setStep] = useState(1);
  const [decision, setDecision] = useState(campaign.decisionMakers);
  const [channels, setChannels] = useState(campaign.channels);
  const decisions = ["Proprietário", "Sócio", "Fundador", "CEO", "Diretor", "Diretor de Marketing", "Diretor Comercial", "Gerente de Marketing", "Gerente Comercial"];
  const channelOptions = ["WhatsApp", "Telefone", "E-mail", "Instagram", "LinkedIn", "Outros"];
  const toggle = (list: string[], item: string) => list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
  const update = (key: keyof Campaign, value: string | number) => setCampaign((current) => ({ ...current, [key]: value }));
  return <>
    <PageHeader eyebrow="NOVA CAMPANHA" title="Configure sua prospecção." description="Defina o alvo. O motor cuida da pesquisa, validação, auditoria e preparação comercial." />
    <div className="wizard-layout"><section className="panel wizard-panel"><div className="stepper"><Step n={1} label="Mercado" active={step === 1} done={step > 1} /><Step n={2} label="Decisor" active={step === 2} done={step > 2} /><Step n={3} label="Oferta & objetivo" active={step === 3} done={step > 3} /></div>
      {step === 1 && <div className="form-grid"><Field label="Segmento" hint="Texto livre"><input value={campaign.segment} onChange={(e) => update("segment", e.target.value)} placeholder="Ex.: Clínicas odontológicas" /></Field><Field label="País"><select defaultValue="Brasil"><option>Brasil</option><option>Portugal</option><option>Outro</option></select></Field><Field label="Estado"><input defaultValue="PR" /></Field><Field label="Cidade"><input value={campaign.location.replace("/PR", "")} onChange={(e) => update("location", `${e.target.value}/PR`)} /></Field><Field label="Bairro ou CEP"><input placeholder="Opcional" /></Field><Field label="Raio de pesquisa"><div className="input-suffix"><input type="number" value={campaign.radius} onChange={(e) => update("radius", Number(e.target.value))} /><span>km</span></div></Field><Field label="Quantidade desejada"><select value={campaign.quantity} onChange={(e) => update("quantity", Number(e.target.value))}><option value={50}>50 empresas</option><option value={100}>100 empresas</option><option value={200}>200 empresas</option><option value={500}>500 empresas</option><option value={1000}>1.000 empresas</option></select></Field></div>}
      {step === 2 && <div><Field label="Quem você quer alcançar?" hint="Selecione um ou mais perfis"><div className="chips-grid">{decisions.map((item) => <button key={item} className={`choice-chip ${decision.includes(item) ? "selected" : ""}`} onClick={() => setDecision(toggle(decision, item)}>{decision.includes(item) && <CheckCircle2 size={14} />}{item}</button>)}</div></Field></div>}
      {step === 3 && <div className="form-stack"><Field label="O que estamos vendendo"><textarea value={campaign.offer} onChange={(e) => update("offer", e.target.value)} placeholder="Ex.: Gestão de tráfego pago para clínicas odontológicas." /></Field><Field label="Objetivo comercial"><div className="chips-grid">{["Agendar reunião", "Solicitar diagnóstico", "Apresentar proposta", "Conversar com responsável", "Gerar oportunidade comercial"].map((item) => <button key={item} className={`choice-chip ${campaign.objective === item ? "selected" : ""}`} onClick={() => update("objective", item)}>{campaign.objective === item && <CheckCircle2 size={14} />}{item}</button>)}</div></Field><Field label="Canais permitidos"><div className="chips-grid">{channelOptions.map((item) => <button key={item} className={`choice-chip ${channels.includes(item) ? "selected" : ""}`} onClick={() => setChannels(toggle(channels, item))}>{channels.includes(item) && <CheckCircle2 size={14} />}{item}</button>)}</div></Field></div>}
      <div className="wizard-footer"><span>{step} de 3</span><div>{step > 1 && <button className="secondary-button" onClick={() => setStep(step - 1)}>Voltar</button>}{step < 3 ? <button className="primary-button" onClick={() => setStep(step + 1)}>Continuar <ArrowRight size={16} /></button> : <button className="primary-button" onClick={() => { setCampaign((c) => ({ ...c, decisionMakers: decision, channels, name: `${c.segment} — ${c.location} — Agosto/2026` })); onStart(); }}><Sparkles size={16} /> Iniciar prospecção</button>}</div></div>
    </section><aside className="panel campaign-preview"><span className="eyebrow">PRÉVIA DO MOTOR</span><h3>{campaign.segment}</h3><div className="preview-line"><MapPin size={15} /> {campaign.location} · raio {campaign.radius} km</div><div className="preview-line"><Users size={15} /> Até {campaign.quantity} empresas</div><div className="preview-line"><Target size={15} /> {campaign.objective}</div><hr /><strong>Pipeline automático</strong><MiniStep icon={Search} label="Descoberta" /><MiniStep icon={Database} label="Enriquecimento & validação" /><MiniStep icon={Globe2} label="Auditoria digital" /><MiniStep icon={Sparkles} label="Diagnóstico & score" /><MiniStep icon={MessageCircle} label="Abordagem com aprovação" /><div className="compliance"><ShieldCheck size={15} /><span>Nenhuma inferência será apresentada como fato.</span></div></aside></div>
  </>;
}

function Campaigns({ campaign, onOpen }: { campaign: Campaign; onOpen: () => void }) { return <><PageHeader eyebrow="CAMPANHAS" title="Suas pesquisas comerciais." description="Cada campanha mantém seu próprio contexto, progresso e métricas." action={<button className="primary-button" onClick={onOpen}><Users size={16} /> Ver leads</button>} /><section className="panel campaign-card-large"><div className="campaign-card-top"><div className="campaign-icon"><Target size={21} /></div><div><span className="status active">ATIVA</span><h2>{campaign.name}</h2><p>{campaign.segment} · {campaign.location} · {campaign.radius} km</p></div><Score score={88} /></div><div className="campaign-stats"><Stat label="Encontrados" value="200" /><Stat label="Válidos" value="168" /><Stat label="Analisados" value="136" /><Stat label="Aprovados" value="82" /><Stat label="Reuniões" value="12" /><Stat label="Conversão" value="—" /></div><div className="progress"><span style={{ width: `${campaign.progress}%` }} /></div></section><div className="empty-note"><Zap size={18} /><div><strong>Fila de processamento pronta</strong><span>As integrações de descoberta e enriquecimento estão desacopladas por provider. Esta versão usa dados demonstrativos para validar o fluxo.</span></div></div></> }

function Leads({ leads, search, setSearch, scoreFilter, setScoreFilter, onLead, onNew }: { leads: Lead[]; search: string; setSearch: (v: string) => void; scoreFilter: string; setScoreFilter: (v: string) => void; onLead: (lead: Lead) => void; onNew: () => void }) {
  return <><PageHeader eyebrow="CENTRAL DE LEADS" title="Contexto antes do contato." description="Filtre por fit, dados, anúncios e oportunidade. Abra qualquer lead para ver as evidências." action={<button className="primary-button" onClick={onNew}><Plus size={16} /> Nova prospecção</button>} /><div className="toolbar"><div className="search-box"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar empresa, decisor, cidade..." /></div><div className="filter-select"><Filter size={15} /><select value={scoreFilter} onChange={(e) => setScoreFilter(e.target.value)}><option>Todos</option><option>80+</option><option>70+</option><option>&lt;70</option></select></div><button className="secondary-button"><MoreHorizontal size={16} /> Filtros avançados</button></div><section className="panel table-panel"><table><thead><tr><th>EMPRESA</th><th>DECISOR</th><th>CONTATO</th><th>ANÚNCIOS</th><th>OPORTUNIDADE</th><th>SCORE</th><th>STATUS</th></tr></thead><tbody>{leads.map((lead) => <tr key={lead.id} onClick={() => onLead(lead)}><td><div className="table-company"><div className="company-avatar">{lead.company.slice(0, 2).toUpperCase()}</div><div><strong>{lead.company}</strong><span>{lead.segment} · {lead.city}/{lead.state}</span></div></div></td><td><strong>{lead.decisionMaker}</strong><span className="cell-sub">{lead.role}</span></td><td><div className="contact-icons">{lead.whatsapp && <span title="WhatsApp"><MessageCircle size={15} /></span>}{lead.phone && <span title="Telefone"><Phone size={15} /></span>}{lead.email && <span title="E-mail"><Mail size={15} /></span>}{lead.instagram && <span title="Instagram">◎</span>}</div></td><td>{lead.ads ? <span className="tag positive"><CircleDot size={11} /> Ativos</span> : <span className="tag neutral">Não observados</span>}</td><td><span className="opportunity-cell">{lead.opportunity}</span></td><td><Score score={lead.score} /></td><td><StatusTag status={lead.status} /></td></tr>)}</tbody></table></section></>;
}

function Pipeline({ leads, onLead }: { leads: Lead[]; onLead: (lead: Lead) => void }) { const columns = ["Encontrado", "Analisando", "Aguardando aprovação", "Pronto para contato", "Interessado", "Reunião agendada"] as LeadStatus[]; return <><PageHeader eyebrow="PIPELINE" title="Da descoberta à reunião." description="Controle humano antes do contato. Mova leads conforme o contexto comercial evolui." /><div className="kanban">{columns.map((status) => <div className="kanban-column" key={status}><div className="kanban-header"><span>{status}</span><b>{leads.filter((l) => l.status === status).length}</b></div>{leads.filter((l) => l.status === status).map((lead) => <button className="kanban-card" key={lead.id} onClick={() => onLead(lead)}><div className="kanban-card-head"><strong>{lead.company}</strong><Score score={lead.score} /></div><span>{lead.decisionMaker} · {lead.role}</span><p>{lead.opportunity}</p><div className="kanban-foot"><span>{lead.ads ? "Anúncios" : "Orgânico"}</span><span>{lead.confidence}% dados</span></div></button>)}</div>)}</div></> }

function Diagnostics({ leads, onLead }: { leads: Lead[]; onLead: (lead: Lead) => void }) { return <><PageHeader eyebrow="INTELIGÊNCIA" title="Diagnósticos comerciais." description="Cada análise conecta evidências, oportunidade e próxima ação — sem crítica genérica." /><div className="diagnostic-grid">{leads.map((lead) => <article className="panel diagnostic-card" key={lead.id}><div className="diagnostic-top"><div className="company-avatar large">{lead.company.slice(0, 2).toUpperCase()}</div><div><strong>{lead.company}</strong><span>{lead.city}/{lead.state} · {lead.role}</span></div><Score score={lead.score} /></div><div className="diagnostic-section"><span className="eyebrow">RESUMO</span><p>{lead.diagnosis}</p></div><div className="insight"><Sparkles size={15} /><div><strong>Microinsight</strong><p>{lead.microInsight}</p></div></div><div className="evidence-row">{lead.evidence.map((e) => <span key={e.label} className={`evidence ${e.type === "Fato verificado" ? "verified" : ""}`}><CheckCircle2 size={12} /> {e.label}</span>)}</div><button className="text-button" onClick={() => onLead(lead)}>Abrir diagnóstico completo <ArrowRight size={14} /></button></article>)}</div></> }

function Messages({ leads, onLead, onApprove }: { leads: Lead[]; onLead: (lead: Lead) => void; onApprove: (id: string) => void }) { return <><PageHeader eyebrow="MENSAGENS" title="Abordagens que precisam de contexto." description="A aprovação humana é obrigatória antes de qualquer integração de envio." /><div className="approval-banner"><ShieldCheck size={20} /><div><strong>Human-in-the-loop ativo</strong><span>Nenhuma mensagem será enviada automaticamente. Você pode editar, regenerar, trocar o canal ou descartar.</span></div></div><section className="panel message-list">{leads.map((lead) => <article className="message-row" key={lead.id}><div className="company-avatar">{lead.company.slice(0, 2).toUpperCase()}</div><div className="message-body"><div className="message-meta"><strong>{lead.company}</strong><span>WhatsApp · {lead.decisionMaker}</span><Score score={lead.score} /></div><p>{lead.suggestedMessage}</p><div className="message-actions"><button className="secondary-button" onClick={() => onLead(lead)}>Editar / revisar</button>{lead.status === "Aguardando aprovação" ? <button className="primary-button" onClick={() => onApprove(lead.id)}><CheckCircle2 size={15} /> Aprovar abordagem</button> : <span className="approved"><CheckCircle2 size={15} /> Aprovada</span>}</div></div></article>)}</section></> }

function Meetings() { return <><PageHeader eyebrow="AGENDA" title="Reuniões qualificadas." description="Conecte o resultado da prospecção à conversa comercial." action={<button className="primary-button"><Plus size={16} /> Nova reunião</button>} /><div className="empty-state panel"><div className="empty-icon"><Activity size={24} /></div><h3>Nenhuma reunião registrada ainda</h3><p>Quando um lead responder e avançar para reunião, ele aparecerá aqui com o diagnóstico e o histórico da abordagem.</p></div></> }

function Integrations() { const providers = [{ name: "Google Maps / Business Profile", desc: "Descoberta local e dados de presença", status: "Arquitetura pronta" }, { name: "Meta Ad Library", desc: "Consulta de anúncios públicos", status: "Provider preparado" }, { name: "Enrichment", desc: "Fontes autorizadas de contatos", status: "Provider preparado" }, { name: "IA", desc: "Diagnóstico, score e copy", status: "Provider preparado" }, { name: "WhatsApp / E-mail", desc: "Envio futuro após aprovação", status: "Desativado" }]; return <><PageHeader eyebrow="INTEGRAÇÕES" title="Providers desacoplados." description="Cada fonte pode falhar sem interromper o restante do pipeline. Conecte APIs quando estiverem disponíveis." /><div className="integration-grid">{providers.map((p) => <section className="panel integration-card" key={p.name}><div className="integration-icon"><Database size={19} /></div><div><strong>{p.name}</strong><span>{p.desc}</span></div><StatusTag status={p.status} /><button className="secondary-button">Configurar</button></section>)}</div></> }

function Settings() { return <><PageHeader eyebrow="CONFIGURAÇÕES" title="Regras do motor." description="Defina pesos, limites e políticas de contato da operação." /><div className="settings-grid"><section className="panel settings-card"><PanelTitle title="Opportunity Score" /><p className="muted">Pesos atuais. Preparado para configuração por workspace.</p>{[["Fit Comercial",25],["Oportunidade Digital",25],["Intenção de Investimento",20],["Qualidade do Contato",15],["Atividade Comercial",15]].map(([label,value]) => <div className="weight" key={label as string}><span>{label}</span><strong>{value}%</strong><div className="progress"><span style={{ width: `${value as number * 4}%` }} /></div></div>)}</section><section className="panel settings-card"><PanelTitle title="Compliance" /><div className="setting-toggle"><div><strong>Lista de bloqueio</strong><span>Impedir novas automações para empresas ou contatos bloqueados.</span></div><div className="toggle on" /></div><div className="setting-toggle"><div><strong>Opt-out obrigatório</strong><span>Registrar e respeitar solicitações de não contato.</span></div><div className="toggle on" /></div><div className="setting-toggle"><div><strong>Aprovação antes do envio</strong><span>Exigir aprovação humana para toda primeira abordagem.</span></div><div className="toggle on" /></div></section></div></> }

function LeadDrawer({ lead, onClose, onApprove }: { lead: Lead; onClose: () => void; onApprove: (id: string) => void }) { return <div className="drawer-overlay" onClick={onClose}><aside className="lead-drawer" onClick={(e) => e.stopPropagation()}><div className="drawer-head"><div><span className="eyebrow">LEAD INTELLIGENCE</span><h2>{lead.company}</h2><span>{lead.segment} · {lead.city}/{lead.state}</span></div><button className="icon-button" onClick={onClose}><X size={18} /></button></div><div className="drawer-scroll"><div className="drawer-score"><div><span>Opportunity Score</span><strong>{lead.score}</strong><small>{scoreLabel(lead.score)}</small></div><div className="confidence"><span>Data Confidence</span><strong>{lead.confidence}/100</strong></div></div><DrawerSection title="Decisor"><div className="person"><div className="person-avatar">{lead.decisionMaker === "Não localizado" ? "?" : lead.decisionMaker.split(" ").map((n) => n[0]).join("").slice(0, 2)}</div><div><strong>{lead.decisionMaker}</strong><span>{lead.role}</span></div></div><div className="contact-list">{lead.phone && <span><Phone size={14} /> {lead.phone}</span>}{lead.email && <span><Mail size={14} /> {lead.email}</span>}{lead.instagram && <span>◎ {lead.instagram}</span>}</div></DrawerSection><DrawerSection title="Presença digital"><div className="link-grid">{lead.website && <a href={`https://${lead.website}`} target="_blank" rel="noreferrer"><Globe2 size={14} /> Site</a>}{lead.instagram && <a href="#"><span>◎</span> Instagram</a>}<a href="#"><MapPin size={14} /> Google</a>{lead.decisionMaker !== "Não localizado" && <a href="#"><Linkedin size={14} /> LinkedIn</a>}</div></DrawerSection><DrawerSection title="Diagnóstico"><p className="drawer-copy">{lead.diagnosis}</p><div className="insight"><Sparkles size={15} /><div><strong>Microinsight Comercial</strong><p>{lead.microInsight}</p></div></div></DrawerSection><DrawerSection title="Evidências"><div className="evidence-list">{lead.evidence.map((item) => <div key={item.label}><span className="evidence-dot" /><div><strong>{item.label}</strong><p>{item.value}</p><small>{item.type} · {item.source}</small></div></div>)}</div></DrawerSection><DrawerSection title="Abordagem sugerida"><div className="message-preview"><span>WhatsApp · Aprovação obrigatória</span><p>{lead.suggestedMessage}</p></div></DrawerSection></div><div className="drawer-footer">{lead.status === "Aguardando aprovação" && <button className="primary-button full" onClick={() => onApprove(lead.id)}><CheckCircle2 size={16} /> Aprovar abordagem</button>}<button className="secondary-button full">Editar diagnóstico</button></div></aside></div> }

function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) { return <div className="page-header"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</div> }
function PanelTitle({ title, action }: { title: string; action?: string }) { return <div className="panel-title"><h3>{title}</h3>{action && <button className="text-button">{action} <ArrowRight size={13} /></button>}</div> }
function MetricCard({ label, value, delta, icon: Icon }: { label: string; value: string; delta: string; icon: typeof Building2 }) { return <div className="metric-card"><div className="metric-icon"><Icon size={18} /></div><span>{label}</span><strong>{value}</strong><small>{delta} <em>vs. período anterior</em></small></div> }
function Score({ score }: { score: number }) { return <div className={`score score-${score >= 80 ? "high" : score >= 70 ? "mid" : "low"}`}><strong>{score}</strong><span>{score >= 80 ? "alta" : score >= 70 ? "boa" : "média"}</span></div> }
function StatusTag({ status }: { status: string }) { const positive = ["Pronto para contato", "Interessado", "Reunião agendada", "Cliente"].includes(status); return <span className={`status-tag ${positive ? "positive" : status === "Aguardando aprovação" ? "warning" : ""}`}>{status}</span> }
function Stat({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><strong>{value}</strong></div> }
function FunnelRow({ label, value, width }: { label: string; value: number; width: string }) { return <div className="funnel-row"><div><span>{label}</span><strong>{value}</strong></div><div className="funnel-bar"><span style={{ width }} /></div></div> }
function Coverage({ label, value }: { label: string; value: number }) { return <div className="coverage-row"><span>{label}</span><div className="progress"><span style={{ width: `${value}%` }} /></div><strong>{value}%</strong></div> }
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) { return <label className="field"><span>{label}{hint && <small>{hint}</small>}</span>{children}</label> }
function Step({ n, label, active, done }: { n: number; label: string; active: boolean; done: boolean }) { return <div className={`step ${active ? "active" : ""} ${done ? "done" : ""}`}><span>{done ? <CheckCircle2 size={15} /> : n}</span><strong>{label}</strong></div> }
function MiniStep({ icon: Icon, label }: { icon: typeof Search; label: string }) { return <div className="mini-step"><Icon size={14} /><span>{label}</span><CheckCircle2 size={13} /></div> }
function DrawerSection({ title, children }: { title: string; children: React.ReactNode }) { return <section className="drawer-section"><h4>{title}</h4>{children}</section> }
