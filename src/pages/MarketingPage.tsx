import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  ClipboardList,
  Clock3,
  Euro,
  Fuel,
  MapPinned,
  ShieldCheck,
  Truck,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";

const trustStats = [
  { label: "Operações ativas por dia", value: "420+" },
  { label: "Viaturas monitorizadas", value: "5-40 / frota" },
  { label: "Tempo médio de planeamento", value: "< 12 min" },
  { label: "Conformidade HOS UE", value: "Nativa" },
];

const howItWorks = [
  {
    title: "Importar e priorizar trabalhos",
    detail: "Centralize pedidos, SLAs e janelas de entrega numa fila única para o turno.",
    icon: ClipboardList,
  },
  {
    title: "Despachar com contexto real",
    detail: "Atribua motorista e viatura com mapa ao vivo, carga e restrições HOS antes de sair.",
    icon: MapPinned,
  },
  {
    title: "Executar e provar resultado",
    detail: "Feche com SLA, custos e relatório operacional prontos para dono da frota ou cliente.",
    icon: BarChart3,
  },
];

const capabilities = [
  {
    title: "Control tower em tempo real",
    detail: "Hoje, Expedição e Mapa ao vivo sincronizados para decidir sem alternar entre ferramentas.",
    icon: Clock3,
  },
  {
    title: "Conformidade UE sem fricção",
    detail: "Regras CE 561/2006 com alertas práticos para evitar multas e replaneamentos de última hora.",
    icon: ShieldCheck,
  },
  {
    title: "Dispatch orientado a custo",
    detail: "Visualize percurso, combustível e risco operacional antes de confirmar cada atribuição.",
    icon: Fuel,
  },
  {
    title: "Branding profissional para escalar",
    detail: "Interface premium para equipas operacionais e pitch-ready para investidores e parceiros.",
    icon: BadgeCheck,
  },
  {
    title: "Equipa alinhada num só fluxo",
    detail: "Despachante, motorista e gestão partilham o mesmo estado operacional, sem ruído de WhatsApp.",
    icon: Users,
  },
  {
    title: "Modelo de preço previsível",
    detail: "Licença mensal clara, sem hardware obrigatório nem contratos mínimos agressivos.",
    icon: Euro,
  },
];

const gapRows = [
  { need: "UX moderna", legacy: "Muitas vezes não", us: "Sim" },
  { need: "Conformidade HOS UE", legacy: "Sim (com atrito)", us: "Sim, nativo" },
  { need: "Sem hardware obrigatório", legacy: "Nem sempre", us: "Sim" },
  { need: "Frotas até 15 viaturas (preço)", legacy: "Contratos altos", us: "Sim" },
  { need: "Regulamentação PT (ex. CMR digital)", legacy: "Parcial", us: "Sim (roadmap demo)" },
  { need: "Pipeline de trabalhos (entidade central)", legacy: "Fragmentado", us: "Sim" },
];

const faqRows = [
  {
    q: "Isto substitui um TMS enterprise completo?",
    a: "Para frotas PME em PT/ES, cobre o núcleo diário: trabalhos, expedição, mapa, motoristas, frota e relatórios operacionais.",
  },
  {
    q: "Preciso instalar hardware próprio?",
    a: "Não. A experiência foi desenhada para funcionar sem lock-in de hardware e sem contrato mínimo de frota elevada.",
  },
  {
    q: "Como melhora a usabilidade para o despachante?",
    a: "Reduz contexto disperso: pesquisa global, alertas acionáveis, navegação por missão e superfícies com foco em decisão rápida.",
  },
  {
    q: "Posso usar para demo comercial ou investidores?",
    a: "Sim. A narrativa de produto, métricas e fluxo operacional já está estruturada para demonstrações profissionais.",
  },
];

export function MarketingPage() {
  return (
    <main className="min-h-dvh bg-[var(--app-bg)] text-[var(--app-fg)]">
      <section className="brand-hero premium-grid relative overflow-hidden border-b border-[var(--app-border)]">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:items-center lg:px-8 lg:py-20">
          <div className="max-w-2xl">
            <p className="inline-flex items-center rounded-full border border-brand-500/25 bg-brand-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-700">
              FleetOS Iberia · PT + ES · sem hardware obrigatório
            </p>
            <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
              Controle a sua frota em minutos, não em folhas de cálculo.
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-[var(--app-muted)]">
              Plataforma de operações para transportadores ibéricos com foco em{" "}
              <strong className="text-[var(--app-fg)]">trabalhos, expedição e conformidade</strong>. Menos ruído,
              decisões mais rápidas e uma marca de produto pronta para crescer.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link to="/app" className="btn-brand inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white">
                Abrir plataforma
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/app/dispatch"
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--app-border)] bg-[var(--app-card)] px-4 py-3 text-sm font-semibold text-[var(--app-fg)] transition hover:-translate-y-0.5 hover:bg-[var(--app-elevated)]"
              >
                Ver expedição
              </Link>
            </div>
            <p className="mt-4 text-sm text-[var(--app-muted)]">
              Sem lock-in de hardware. Sem setup pesado. Fluxo pronto para equipas de 5-40 viaturas.
            </p>
          </div>

          <div className="rounded-3xl border border-[var(--app-border)] bg-[var(--app-card)] p-5 shadow-xl shadow-brand-900/5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--app-muted)]">Impacto operacional</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {trustStats.map((row) => (
                <div key={row.label} className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-elevated)] p-4">
                  <p className="text-xl font-bold text-[var(--app-fg)]">{row.value}</p>
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--app-muted)]">{row.label}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 rounded-xl border border-brand-500/20 bg-brand-500/10 px-3 py-2 text-xs text-brand-900">
              Branding e usabilidade redesenhados para transmitir confiança logo nos primeiros 5 segundos.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Como funciona em 3 passos</h2>
        <p className="mt-2 max-w-2xl text-sm text-[var(--app-muted)]">
          Um fluxo simples para reduzir esforço cognitivo e acelerar decisões em cada turno.
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {howItWorks.map(({ title, detail, icon: Icon }, idx) => (
            <article key={title} className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-card)] p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/15 text-brand-700">
                  <Icon className="h-5 w-5" />
                </div>
                <span className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--app-muted)]">Passo {idx + 1}</span>
              </div>
              <h3 className="mt-4 text-base font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--app-muted)]">{detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-[var(--app-border)] bg-[var(--app-elevated)]/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Branding forte, operação ainda melhor</h2>
          <p className="mt-2 max-w-2xl text-sm text-[var(--app-muted)]">
            Esta versão reposiciona o produto com linguagem clara, hierarquia visual e superfícies pensadas para execução diária.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {capabilities.map(({ title, detail, icon: Icon }) => (
              <article
                key={title}
                className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-card)] p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/15 text-brand-700">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--app-muted)]">{detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Onde ganhamos aos stacks legacy</h2>
        <p className="mt-2 max-w-2xl text-sm text-[var(--app-muted)]">
          A decisão fica mais fácil quando o operador compara execução real vs. fricção tradicional.
        </p>
        <div className="mt-6 overflow-hidden rounded-2xl border border-[var(--app-border)] bg-[var(--app-card)]">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--app-border)] text-xs uppercase tracking-[0.16em] text-[var(--app-muted)]">
              <tr>
                <th className="px-4 py-3">Necessidade</th>
                <th className="px-4 py-3">Cenário típico legacy</th>
                <th className="bg-brand-500/10 px-4 py-3 text-brand-800">FleetOS Iberia</th>
              </tr>
            </thead>
            <tbody>
              {gapRows.map((row) => (
                <tr key={row.need} className="border-b border-[var(--app-border)]/70 last:border-b-0">
                  <td className="px-4 py-3 font-medium">{row.need}</td>
                  <td className="px-4 py-3 text-[var(--app-muted)]">{row.legacy}</td>
                  <td className="bg-brand-500/5 px-4 py-3 font-semibold text-emerald-700">{row.us}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="border-y border-[var(--app-border)] bg-[var(--app-card)]">
        <div className="mx-auto w-full max-w-4xl px-4 py-14 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Perguntas frequentes</h2>
          <div className="mt-6 space-y-3">
            {faqRows.map((item) => (
              <article key={item.q} className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-elevated)]/40 p-5">
                <h3 className="text-sm font-semibold text-[var(--app-fg)]">{item.q}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--app-muted)]">{item.a}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-brand-700/20 bg-gradient-to-r from-brand-800 to-brand-700 p-8 text-white shadow-xl shadow-brand-900/15">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/75">Call to action</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Transforme operações dispersas numa marca que inspira confiança</h2>
          <p className="mt-3 max-w-2xl text-sm text-white/80">
            Explore agora o ambiente completo de operações com fluxo otimizado para decisão rápida e comunicação clara.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/app" className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-brand-800 transition hover:bg-white/90">
              <Truck className="h-4 w-4" />
              Entrar na plataforma
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/app/map"
              className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/20"
            >
              Ver mapa ao vivo
            </Link>
          </div>
          <p className="mt-4 text-xs text-white/80">Sem compromisso de infraestrutura. Pronto para demo comercial ainda hoje.</p>
        </div>
      </section>
    </main>
  );
}
