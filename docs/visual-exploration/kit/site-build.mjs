import fs from "node:fs";
const items = JSON.parse(fs.readFileSync("../site/manifest.json", "utf8"));
const ROUNDS = { 1: ["Primitivos visuais", "73 estudos isolados por domínio + 14 estados do laboratório atual."], 2: ["Ligações e dinamismo", "Ecrãs que ligam transporte, motorista, viatura, documentos e restrições; 4 animações."], 3: ["Espaço de trabalho espacial", "O mapa a ganhar e a perder espaço: estados, sequências de transformação e movimento."], 4: ["Do zero", "66 estudos desenhados em branco por domínio + 14 ecrãs assinatura refinados."], 5: ["Sistemas de layout (interrompida)", "Workspaces completos com o shell; ronda parada a meio a teu pedido."], 6: ["Ecrãs de escritório", "15 ecrãs completos, cada um numa linguagem de design diferente."] };
const tpl = fs.readFileSync("site-template.html", "utf8");
fs.writeFileSync("../site/index.html", tpl.replace("/*DATA*/", `const ITEMS=${JSON.stringify(items)};const ROUNDS=${JSON.stringify(ROUNDS)};`));
console.log("ok", (fs.statSync("../site/index.html").size / 1024).toFixed(0) + "KB");
