# Rio

Jogo de tabuleiro para 2–6 pessoas, no mesmo computador ou em notebooks separados pela rede local.

## Rodar

```bash
npm install
npm run dev
```

Abra `http://127.0.0.1:5173`.

## Jogar em notebooks separados

```bash
npm run build
npm start
```

O terminal mostra os endereços disponíveis. Nos dois notebooks, abra o endereço da rede local, como `http://192.168.0.7:4173`. Um jogador cria a sala e passa o código de quatro caracteres ao outro.

Os notebooks precisam estar na mesma rede Wi-Fi. Se o Windows pedir acesso ao Node.js no firewall, permita em redes privadas.

## Testes

```bash
npm test
```

O motor cobre movimento, compra, aluguel de circuito completo, construções equilibradas, hipoteca, leilão, falência e espera por três duplas.

## Arquitetura

- React e CSS para tabuleiro, HUD, animações e responsividade.
- Motor de regras em TypeScript puro em `src/game/engine.ts`.
- Salvamento automático no `localStorage`.
- Servidor HTTP e WebSocket em Node.js para salas e sincronização em tempo real.

Não há banco de dados: as salas vivem na memória enquanto o servidor estiver aberto.

Os nomes, textos, personagens e artes deste projeto são originais. As regras econômicas foram adaptadas a partir da documentação pública do jogo clássico da Hasbro, sem reutilizar sua marca ou identidade visual.
