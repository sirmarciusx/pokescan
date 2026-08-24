# ⚡ PokeScan TCG - Leitor & Cotação de Cartas Pokémon

Aplicativo web mobile-first (PWA) de alto desempenho desenvolvido para reconhecimento visual e cotação em tempo real de cartas de **Pokémon TCG** diretamente pela câmera do smartphone.

![PokeScan Preview](https://images.pokemontcg.io/sv3pt5/199_hires.png)

---

## 🚀 Principais Recursos

- 📷 **Scanner por Câmera em Tempo Real**: Enquadramento exato no formato de cartas Pokémon (63mm x 88mm), controle de lanterna (flash), alternância de câmera e zoom 1x/2x.
- 🧠 **Reconhecimento Híbrido por IA e OCR**:
  - **IA Vision (Google Gemini 2.5 Flash)**: Identificação instantânea da arte da carta, coleção, raridade e número de série.
  - **OCR Local (Tesseract.js & Binarização de Contraste)**: Extração inteligente do número do rodapé (`025/165`, `4/102`, etc.) e nome sem depender de APIs externas.
- 💎 **Card 3D Holográfico Interativo**: Efeito 3D com brilho holográfico reativo ao toque (mobile), mouse ou giroscópio do celular.
- 💰 **Cotações de Mercado em Tempo Real**:
  - Preços atualizados via TCGplayer e cotação de câmbio USD ➔ BRL automática.
  - Valores para variantes: Normal, Holofoil, Reverse Holofoil, Menor e Maior Preço.
  - Seletor de estado de conservação (*Near Mint*, *Lightly Played*, *Damaged*) com recálculo de valor.
  - Links diretos para compra/venda na **LigaPokémon (Brasil)** e **TCGplayer**.
- 🗂️ **Minha Coleção (Binder)**:
  - Armazenamento persistente no dispositivo (IndexedDB / LocalStorage).
  - Cálculo do valor total estimado do seu acervo em **R$ (BRL)**.
  - Exportação e importação da coleção em **JSON** e **CSV (Excel)**.
- 📲 **Suporte a PWA**: Instale diretamente na tela inicial do seu iPhone (Safari) ou Android (Chrome) como um aplicativo nativo.

---

## 🛠️ Como Executar Localmente

### Pré-requisitos
- Node.js instalado (v18+)

### Instalação e Execução
```bash
# Iniciar o servidor local (Porta 3000)
node server.js
```
- Acesse no computador: `http://localhost:3000`
- Acesse no smartphone (mesmo Wi-Fi): `http://<SEU_IP_LOCAL>:3000`

---

## 🌐 Deploy na Vercel

1. Faça o push deste repositório para o seu **GitHub**.
2. Acesse [vercel.com](https://vercel.com) e importe o repositório.
3. Como o projeto é baseado em ES Modules puros, as configurações padrões (`Other` / static) funcionarão instantaneamente.
4. Clique em **Deploy**.

---

## 📄 Licença e Isenção de Responsabilidade
Pokémon e Pokémon TCG são marcas registradas da Nintendo, Creatures Inc. e GAME FREAK Inc. Este é um projeto de código aberto sem fins lucrativos destinado a colecionadores e entusiastas do jogo.
