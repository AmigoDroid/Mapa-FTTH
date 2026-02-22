# FABREU FTTH Doc

Aplicacao React + Vite para geodocumentacao de redes FTTH com foco em operacao de campo: caixas, POPs, cabos, reservas, fusoes e continuidade.

## Objetivo
- Modelar rede FTTH no mapa (Leaflet).
- Registrar topologia (caixas, cabos, POPs e fusoes).
- Permitir validacao basica de continuidade e estimativa de perdas.
- Exportar e importar rede em JSON.

## Stack
- React 18 + TypeScript
- Vite
- Tailwind + componentes UI (Radix)
- Leaflet
- Estado global via contexto (`src/store/networkStore.tsx`)

## Estrutura principal
- `src/components/map/NetworkMap.tsx`: mapa, desenho de cabos, criacao de caixas/POPs/reservas.
- `src/components/ui-custom/NetworkPanel.tsx`: painel lateral, explorer e import/export.
- `src/components/ui-custom/BoxDetail.tsx`: detalhes e fusoes de caixa.
- `src/components/ui-custom/PopDetail.tsx`: detalhes de POP (DIO/OLT/Switch/Router/fusoes).
- `src/store/networkStore.tsx`: regras de negocio e mutacoes da rede.
- `src/types/ftth.ts`: tipagem de dominio FTTH.

## Como executar
```bash
npm install
npm run dev
```

## Scripts
- `npm run dev`: ambiente local.
- `npm run lint`: analise esttica com ESLint.
- `npm run build`: checagem TypeScript + build de producao.
- `npm run preview`: visualizacao do build local.

## Fluxo recomendado de uso
1. Criar uma rede.
2. Cadastrar cidade e POP.
3. Adicionar caixas no mapa.
4. Desenhar cabos (com ou sem origem/destino).
5. Abrir detalhes da caixa/POP para fusoes e interligacoes.
6. Exportar JSON para versionamento/backup.

## Convencoes de dados
- IDs sao gerados no cliente.
- Distancias de cabos sao aproximadas por haversine.
- Atenuacao GPON e estimada por regras simplificadas no store.

## Qualidade e manutencao
- Evite adicionar regra de negocio em componentes de UI; priorize `networkStore`.
- Sempre rodar `npm run lint` e `npm run build` antes de publicar.
- Preferir tipagem explicita no dominio FTTH e evitar `any`.

## Limitacoes atuais
- Sem autenticacao/multiusuario.
- Sem persistencia em backend (estado local + import/export JSON).
- Sem suite de testes automatizados ainda.

## Proximos passos sugeridos
- Persistencia em API + historico de mudancas.
- Testes unitarios para regras de fusao e continuidade.
- Divisao do store monolitico em modulos por dominio (cabos, caixas, POPs).
