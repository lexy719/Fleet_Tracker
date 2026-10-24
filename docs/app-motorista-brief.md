# App do Motorista — o que ficou decidido (para os mockups)

23 de outubro de 2026 · resumo das conversas sobre o backend que afetam a app do motorista. Complementa `driver-app-spec.md`.

## 1. Mapa e navegação

- **Mapa:** OpenStreetMap com o nosso estilo (MapLibre), grátis e com controlo total do design. Fotos aéreas oficiais grátis (DGT 2025 em PT, PNOA em ES) como camada de satélite. Google só para moradas, no escritório.
- **Rota:** sempre calculada pelo **nosso motor de camião** (curvas, aldeias, inclinação, restrições, VCI, obras com data). Nunca uma rota de carro.
- **Recalcular:** quando o motorista sai da rota, o nosso servidor calcula outra rota de camião.
- **Instruções passo a passo:** nossas. O nome da rua vem **da própria rota**, não do GPS — acaba com os nomes de rua errados de hoje.
- **Mostrar número + nome juntos:** "N-342 · Av. de Andalucía", "EN 205 · Póvoa de Lanhoso".
- **Destino = portão de camiões**, não a morada. Ex.: "Entreposto Sonae Maia — entrada camiões".

## 2. Avisos na rota

- **Troço não confirmado para pesados:** aviso discreto quando a rota usa uma estrada pequena ou dentro de localidade sem dados (ex.: estrada apertada sem alternativa).
- **Restrições e obras com data:** cortes, obras, proibições de pesados, VCI; com a fonte e a hora da última atualização.
- **Estrada difícil mas sem alternativa:** a rota usa-a (como fazem os camionistas) e avisa ("estrada estreita e com curvas nos próximos 28 km").

## 3. Avisos por voz (Waze para camiões)

**Fluxo:**
1. **Um botão:** grande no ecrã ou um botão Bluetooth no volante (~€10–20). É como carregar no rádio.
2. **GPS guardado no momento do toque** (a 90 km/h o camião anda ~25 m/s).
3. **O motorista fala:** "ponte baixa, três metros e oitenta", "rua fechada, obras", "esta estrada é apertada até Cabeceiras".
4. **A app repete em voz:** "Registei: altura máxima 3,8 metros, aqui. Confirmas?"
5. **Responde "sim" ou "não"** por voz. Sem resposta → fica em rascunho para rever na paragem.

**Extensão ("esta estrada"):**
- "aqui", "esta ponte", "esta rotunda" → ponto (~200 m);
- "até à aldeia", "até ao cruzamento" → até esse sítio;
- "até Cabeceiras", "esta estrada toda" → até à localidade ou até a estrada mudar de número;
- sem nada → até ao próximo cruzamento importante, máximo ~5 km.
- A app diz a extensão na confirmação ("daqui até Cabeceiras, 28 km") e **mostra o troço no mapa na próxima paragem** para corrigir.

**Tipos de aviso:**

| Tipo | Exemplos | Efeito |
|---|---|---|
| Proibição | "proibido pesados", "ponte 3,5 t", "altura 3,8" | Bloqueia a estrada depois de 2–3 motoristas ou fonte oficial |
| Dificuldade | "apertada", "muitas curvas", "rotunda pequena", "subida forte" | Torna a estrada mais "cara", nunca proíbe |
| Temporário | "obras", "cortada", "acidente", "feira hoje" | Bloqueia ou penaliza até expirar |
| Positivo | "dá bem para camião" | Baixa a dificuldade |

**Confirmar ao passar:** ao aproximar-se de um aviso de outro motorista, a app pergunta por voz "Altura 3,8 m ainda aqui?" → sim / não.

**Outros pontos:** vários idiomas (muitos motoristas não são portugueses nem espanhóis), a app responde na língua do motorista; motoristas que avisam bem ganham confiança; **sem câmara** (o telemóvel é o ecrã de navegação, não vê bem a estrada).

## 4. O que a app aprende sozinha (sem o motorista fazer nada)

- Velocidade real em cada estrada (substitui as estimativas).
- Voltas atrás / desvios onde a rota mandou → possível restrição.
- Estradas por onde passa que não temos no mapa.
- **Posição real do portão** (onde o camião para) e **tempo real de espera** no cais.

## 5. Combustível, horas, trabalho

- **Combustível:** que bomba, quanto meter, encaixado na pausa legal, com preço.
- **Horas de condução:** pausas já dentro da rota; horas que restam (dia, semana, quinzena).
- **Trabalho:** várias paragens com carga parcial (paletes, peso), ordem de carga, documentos (CMR), prova de entrega — ver `driver-app-spec.md`.
- **Portal do expedidor:** a posição GPS da app dá a hora de chegada ao cliente (o caso Prozis).

## 6. Ecrãs que os mockups devem mostrar

1. **Navegação**: mapa OSM, rota de camião, instrução com número + nome da estrada, aviso de troço difícil ou não confirmado.
2. **Aviso por voz**: botão → "a ouvir" → leitura em voz alta → sim / não.
3. **Pergunta ao passar**: "Altura 3,8 m ainda aqui?".
4. **Rever avisos na paragem**: troço desenhado no mapa, corrigir extensão.
5. **Chegada**: confirmar portão de camiões (primeira visita).
6. **Paragem para abastecer**: bomba, litros, preço, dentro da pausa.
7. **Horas**: tempo de condução restante, próxima pausa.
