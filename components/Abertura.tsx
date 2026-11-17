/**
 * Abertura do app: um planeta no centro, uma órbita inclinada e um satélite que gira em volta
 * (passa por trás e pela frente do planeta). É só HTML e CSS, sem JavaScript para rodar:
 * some sozinha depois de ~2,3 s. Não aparece com "reduzir movimento", com a animação desligada em Mais
 * nem de novo na mesma sessão (o controle fica em `html[data-splash="off"]`, ver o script em layout.tsx).
 */
export const CHAVE_ABERTURA = "orbita-splash";

export default function Abertura() {
  // elipse da órbita: centro (150,150), raios 112 x 34, inclinada em -18 graus
  const orbita = "M 38 150 A 112 34 0 1 1 262 150 A 112 34 0 1 1 38 150 Z";
  return (
    <div className="abertura" aria-hidden>
      <svg viewBox="0 0 300 300" width="300" height="300" className="abertura-svg">
        <defs>
          <radialGradient id="ab-planeta" cx="34%" cy="30%" r="80%">
            <stop offset="0%" stopColor="#bdeaff" />
            <stop offset="38%" stopColor="#3b8bff" />
            <stop offset="78%" stopColor="#1b2a8a" />
            <stop offset="100%" stopColor="#0a0f3d" />
          </radialGradient>
          <radialGradient id="ab-brilho" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.38" />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="ab-anel" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.15" />
            <stop offset="50%" stopColor="#22d3ee" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.15" />
          </linearGradient>
          {/* metade de cima da órbita: o satélite passa por trás do planeta; metade de baixo: pela frente */}
          <clipPath id="ab-atras"><rect x="0" y="0" width="300" height="150" /></clipPath>
          <clipPath id="ab-frente"><rect x="0" y="150" width="300" height="150" /></clipPath>
        </defs>

        <circle cx="150" cy="150" r="140" fill="url(#ab-brilho)" className="ab-halo" />

        <g transform="rotate(-18 150 150)">
          <path d={orbita} fill="none" stroke="url(#ab-anel)" strokeWidth="1.6" className="ab-anel" pathLength={1} />
          <g clipPath="url(#ab-atras)">
            <g className="ab-sat"><circle r="5" fill="#22d3ee"><animateMotion dur="1.15s" repeatCount="2" path={orbita} /></circle></g>
          </g>
        </g>

        <circle cx="150" cy="150" r="52" fill="url(#ab-planeta)" className="ab-planeta" />
        <ellipse cx="136" cy="130" rx="20" ry="11" fill="#ffffff" fillOpacity="0.16" className="ab-planeta" />

        <g transform="rotate(-18 150 150)">
          <g clipPath="url(#ab-frente)">
            <path d={orbita} fill="none" stroke="url(#ab-anel)" strokeWidth="1.6" className="ab-anel" pathLength={1} />
            <circle r="5.5" fill="#7cf2ff"><animateMotion dur="1.15s" repeatCount="2" path={orbita} /></circle>
            <circle r="11" fill="#22d3ee" opacity="0.28"><animateMotion dur="1.15s" repeatCount="2" path={orbita} /></circle>
          </g>
        </g>
      </svg>
      <div className="abertura-nome">Órbita</div>
    </div>
  );
}
