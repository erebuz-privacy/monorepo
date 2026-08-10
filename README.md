<p align="center">
  <img src="apps/landing/public/images/erebuz-logo.svg" alt="Erebuz" width="72" />
</p>

<h1 align="center">Erebuz</h1>

<p align="center">
  Private cross-chain USDC transfers with route choice built in.
</p>

Erebuz gives users a simple way to move USDC across chains without exposing a direct public link between sender and recipient. One transfer request returns multiple private routes, and the user chooses which privacy pool handles the transfer.

Circle CCTP moves native USDC between chains. Railgun and the Erebuz Privacy Pool provide two independent privacy options.

![Erebuz private USDC routes](apps/deck/public/diagrams/private-usdc-routes.png)

## Two private routes

| Route | Flow |
| --- | --- |
| <img src="apps/landing/public/protocols/railgun.jpg" alt="Railgun" width="28" /> Railgun | Base Sepolia → Circle CCTP → Railgun Pool → Circle CCTP → Arc Testnet |
| <img src="apps/landing/public/images/erebuz-logo.png" alt="Erebuz" width="28" /> Erebuz | Base Sepolia → Circle CCTP → Erebuz Privacy Pool on Arc → Arc Testnet |

The Railgun route shields USDC in the Railgun pool, unshields it privately, and uses CCTP for the final move to Arc.

The Erebuz route moves USDC to Arc through CCTP, deposits it into the Erebuz pool, waits for ASP approval, generates the withdrawal proof, and pays the recipient directly on Arc.

## How it works

1. The sender enters an amount and recipient.
2. Erebuz returns a quote for each available privacy pool.
3. The sender chooses Railgun or Erebuz.
4. Circle CCTP moves native USDC between the required chains.
5. The selected pool breaks the public link between sender and recipient.
6. The recipient receives USDC on Arc Testnet.

## Demo stack

| Role | Network or protocol |
| --- | --- |
| Source | <img src="apps/app/public/chains/base.jpg" alt="Base" width="24" /> Base Sepolia |
| Asset | <img src="apps/landing/public/content/start/assets/images/USDC.png" alt="USDC" width="24" /> USDC |
| Transport | Circle CCTP |
| Privacy | Railgun or Erebuz Privacy Pool |
| Destination | <img src="apps/app/public/chains/Arc.jpg" alt="Arc" width="24" /> Arc Testnet |

Erebuz keeps transport and privacy separate. CCTP handles native USDC movement, while privacy pools compete as routes. Users get a clear quote and remain in control of the path.
