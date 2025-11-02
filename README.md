<div align="center">

# 🚀 Citizens' Hub

### Your Ultimate Star Citizen Ship Upgrade Planner

*Plan your fleet upgrades with precision and save credits like a true citizen*

[![Discord](https://dcbadge.limes.pink/api/server/AEuRtb5Vy8)](https://discord.gg/AEuRtb5Vy8)

[![Version](https://img.shields.io/badge/version-1.1.1-blue.svg)](https://github.com/Citizens-Hub/App)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

![Citizens Hub Interface](https://github.com/user-attachments/assets/5842031b-28ff-484b-9a46-100c0d57732d)

</div>

## Table of Contents
- [🚀 Citizens' Hub](#-citizens-hub)
    - [Your Ultimate Star Citizen Ship Upgrade Planner](#your-ultimate-star-citizen-ship-upgrade-planner)
  - [Table of Contents](#table-of-contents)
  - [I cloned the repo but how do I run it locally?](#i-cloned-the-repo-but-how-do-i-run-it-locally)
    - [How to install](#how-to-install)
    - [How to run](#how-to-run)
  - [So how do I use it?](#so-how-do-i-use-it)
  - [What if I want to use the CCUs in my hangar?](#what-if-i-want-to-use-the-ccus-in-my-hangar)
  - [So, what if I want to buy CCUs from eBay?](#so-what-if-i-want-to-buy-ccus-from-ebay)
  - [Another Case](#another-case)
  - [How to change the priority order for automatically selecting CCU sources when creating connections](#how-to-change-the-priority-order-for-automatically-selecting-ccu-sources-when-creating-connections)
  - [Can I see my buy-back pledges/ships/ship packages in my hangar and incorporate them into the CCU chain construction?](#can-i-see-my-buy-back-pledgesshipsship-packages-in-my-hangar-and-incorporate-them-into-the-ccu-chain-construction)


## I cloned the repo but how do I run it locally?

We use mainly `pnpm` but you can also use `bun` for better performance and speed.

### How to install

With `pnpm`

```bash
pnpm i
```

or with `bun`

```bash
bun install
```

### How to run

With `pnpm`

```bash
pnpm dev
```

or with `bun`

```bash
bun dev
```


## So how do I use it?

If you're using it for the first time, you're probably eager to start creating your first chain. The first thing you need to decide is the starting and ending points of the chain.

For the upcoming Fleet Week, I want to upgrade my ATLAS GEO to a Starlancer Tac. So, let's first choose to insert these two nodes.

![](https://citizenshub.app/imgs/tutorial/02.png)

You can find them in the available ships on the left and drag them onto the canvas. At the same time, you can see that there are several currently available WB (Warbond) packages at the top of the available ship selector. So, to save more money for an extra treat.

![](https://citizenshub.app/imgs/tutorial/03.png)

The essence of planning a CCU path lies in inserting enough WB CCU packages into the path. Let's turn on the option to display historical WBs and see what historical WBs are available (ships that have had WBs in the past are more likely to have new WBs in the future).

![](https://citizenshub.app/imgs/tutorial/04.png)

For simplicity, as an example, we only added a few packages to the line. This way, we get a CCU chain. Click on our target ship to see the detailed upgrade path and cost.

**Special reminder:** If you need to use historical WBs for your planning, you need to click the edit path button on the ship node card, select historical WB for a certain path. When connecting nodes, only currently on-sale WBs and CCUs in your hangar will be automatically set.

## What if I want to use the CCUs in my hangar?

For Chrome & Edge users:

[Chrome web store](https://chromewebstore.google.com/detail/citizens-hub/hngpbfpdnkobjjjbdmfncbbjjhpdmaap)

For Firefox users:

[Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/citizens-hub/)

After completing the installation, make sure you are logged into the official Star Citizen website. If everything is fine, click the refresh button in the "My Hangar" section (not the browser's refresh button! After installing the extension, you'll need to refresh the page once, but not afterwards). Soon, the CCUs you own will be displayed here.

![](https://citizenshub.app/imgs/tutorial/05.png)

## So, what if I want to buy CCUs from eBay?

It's simple. Find a reliable seller and ask for the price of the CCUs they are selling.

For example, if someone is selling a CCU from Nova to Vanguard Sentinel for $10 (just an example, the Vanguard Sentinel doesn't have such cheap WBs now).

Then you need to click the edit path button on the Vanguard Sentinel node, and for the incoming link from Nova, select "Manual: Third-party CCU" and set the price to $10.

**Note:** If the currency displayed for third-party CCUs here is not your preferred currency, go to [App Settings](https://citizenshub.app/app-settings) - Preferences and select your preferred currency.

![](https://citizenshub.app/imgs/tutorial/06.png)

## Another Case

If the Vanguard Sentinel will be a WB during Fleet Week, then you have two paths to choose from – you can buy the CCU from eBay, or wait for the official WB. But you can't make up your mind because you want to save money and also want store credit/spending.

![](https://citizenshub.app/imgs/tutorial/07.png)

Very simple! Duplicate a Vanguard Sentinel node, create another connection from Nova to Vanguard Sentinel, and select historical WB (or "Manual: Official CCU", so you can set a custom estimated price).

You may have noticed that the historical WB's Vanguard Sentinel node is not connected to the MOLE. Don't worry! This route will also be included in the calculation when you finally view the upgrade route for the Starlancer TAC. You just need to ensure that a node corresponding to the current ship has a connection created.

![](https://citizenshub.app/imgs/tutorial/08.png)

Remember the "have your cake and eat it too" dilemma we just talked about? Let's consider this problem quantitatively:

You want store credit, so you spend money. We know that you can earn store credit by purchasing items for others. You might give the buyer a discount, say 10%, then the cost for you to obtain $1 of store credit is 10 cents. You can factor store credit into consideration by setting the store credit value in the panel on the right.

Also, you can set the cost of purchasing your starting ship in the panel on the right. This will help to better calculate the total value of the entire chain.

Just remember, the final cost of a route we calculate is equivalent to the money you actually spend + the money you need to spend to buy back the store credit lost due to purchasing CCUs from third parties. If you don't want store credit, just set this value to 0.

## How to change the priority order for automatically selecting CCU sources when creating connections

Go to [App Settings](/app-settings) to set the priority order. When creating connections, the system will automatically select CCU sources based on this priority order and their availability.

![](https://citizenshub.app/imgs/tutorial/09.png)

## Can I see my buy-back pledges/ships/ship packages in my hangar and incorporate them into the CCU chain construction?

Working on it, will be supported in the future.

<div align="center">

**Made with ❤️ for the Star Citizen community**

*Not affiliated with Cloud Imperium Games or Roberts Space Industries*

[🌐 Visit Website](https://citizenshub.app) • [🎮 Discord](https://discord.gg/AEuRtb5Vy8)

</div>
