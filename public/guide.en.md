# Citizen's Hub Ship Upgrade Planner

![](https://i1.hdslb.com/bfs/new_dyn/1624ec15d9e8cfcdcaa1a9b5a558267d203970966.png@1192w.avif)

Tool Link: https://citizenshub.app/ccu-planner

GitHub Repository: https://github.com/EduarteXD/citizenshub

Discord: https://discord.gg/GZznXzPF

## What are the advantages of this software compared to CCU Game or others?

Admittedly, there are many excellent Star Citizen helper tools on the market that can help you plan your CCU chains.

But personally, I find their CCU chain features not very intuitive when it comes to editing or managing upgrade paths.

For example, I might need to insert some Warbond upgrades purchased from third-party channels like Xianyu (a popular Chinese second-hand marketplace), which is not easy to do in existing software.

Furthermore, they don't support planning multiple starting or ending points in a single chain. My envisioned use case is:

You can create a CCU upgrade chain that may have multiple starting points and multiple ending points (including intermediate points).

Once the upgrade chain is built (as shown in the picture), if you want to see the route to upgrade to Nova, you can click on the Nova card to view the route from the starting point to Nova.

The same applies to ships like the E1, Dragonfly, Aurora, etc. You can click on their cards to see the upgrade path for each ship.

I believe that, compared to traditional planning software, my software can benefit professional users who were originally using Excel to plan their CCUs more.

## So how do I use it?

If you're using it for the first time, you're probably eager to start creating your first chain. The first thing you need to decide is the starting and ending points of the chain.

For the upcoming Fleet Week, I want to upgrade my ATLAS GEO to a Starlancer Tac. So, let's first choose to insert these two nodes.

FYI: Although this project currently only has manual path planning, I have already completed the prototype design for semi-automatic and fully automatic planning. These two functions will be available soon.

![](https://i1.hdslb.com/bfs/new_dyn/5492edc83747a2c1ae57719c843a5b7a203970966.png@1192w.avif)

You can find them in the available ships on the left and drag them onto the canvas. At the same time, you can see that there are several currently available WB (Warbond) packages at the top of the available ship selector. So, to save more money for an extra treat (literally "add a chicken leg to your meal"), let's plan these packages into the path.

![](https://i1.hdslb.com/bfs/new_dyn/ec228d0cd385bba5ce1ca38bb8722324203970966.png@1192w.avif)

The essence of planning a CCU path lies in inserting enough WB CCU packages into the path. Let's turn on the option to display historical WBs and see what historical WBs are available (ships that have had WBs in the past are more likely to have new WBs in the future).

![](https://i1.hdslb.com/bfs/new_dyn/946247ad40b5ff9bc38ec3ecfcc26ef0203970966.png@1192w.avif)

For simplicity, as an example, we only added a few packages to the line. This way, we get a CCU chain. Click on our target ship to see the detailed upgrade path and cost.

Special reminder: If you need to use historical WBs for your planning, you need to click the edit path button on the ship node card, select historical WB for a certain path. When connecting nodes, only currently on-sale WBs and CCUs in your hangar will be automatically set.

## What if I want to use the CCUs in my hangar?

In the upper left corner of the canvas, there is a "My Hangar" section. This is where your hangar CCUs are displayed. You need to click "Download Extension," unzip it, and then go to:

chrome://extensions/

Turn on Developer Mode in the upper right corner, then click "Load unpacked" and select the directory where you unzipped the extension to install it.

After completing the installation, you need to check if you have logged into the official Star Citizen website. If everything is fine, click the refresh button in the "My Hangar" section (not the browser's refresh button! Of course, after installing the extension, you'll need to refresh the page once, but not afterwards). Soon, the CCUs you own will be displayed here.

![](https://i1.hdslb.com/bfs/new_dyn/e0914b01fff9fba50b1be866ac0053d3203970966.png@1192w.avif)

## So, what if I want to buy CCUs from eBay?

It's simple. Find a reliable seller and ask for the price of the CCUs they are selling.

For example, if someone is selling a CCU from Nova to Vanguard Sentinel for 10 RMB (this is just a made-up example, the Vanguard Sentinel doesn't have such cheap WBs now).

Then you need to click the edit path button on the Vanguard Sentinel node, and then for the incoming link from Nova, select "Manual: Third-party CCU" and set the price to 10 RMB.

FYI: Currently, you can only enter RMB here. In the future, I will modify this function to allow you to choose more types of currencies.

![](https://i1.hdslb.com/bfs/new_dyn/c4d365455f14c8095f0e15115f44c0ae203970966.png@1192w.avif)

## Another Case

If the Vanguard Sentinel will be a WB during Fleet Week, then you have two paths to choose from – you can buy the CCU from eBay, or wait for the official WB. But you can't make up your mind because you want to save money and also want store credit/spending.

![](https://i1.hdslb.com/bfs/new_dyn/a432764b0bc2ae7aa4f4645fccedef9c203970966.png@1192w.avif)

Very simple! Duplicate a Vanguard Sentinel node, create another connection from Nova to Vanguard Sentinel, and select historical WB (or "Manual: Official CCU", so you can set a custom estimated price).

You may have noticed that the historical WB's Vanguard Sentinel node is not connected to the MOLE. Don't worry! This route will also be included in the calculation when you finally view the upgrade route for the Starlancer TAC. You just need to ensure that a node corresponding to the current ship has a connection created.

![](https://i1.hdslb.com/bfs/new_dyn/4d2e0a71d880b83ae224fee2454049e1203970966.png@1192w.avif)

Remember the "have your cake and eat it too" dilemma we just talked about? Let's consider this problem quantitatively:

You want store credit, so you spend money. We know that you can earn store credit by purchasing items for others. You might give the buyer a discount, say 10%, then the cost for you to obtain $1 of store credit is 10 cents. You can factor store credit into consideration by setting the store credit value in the panel on the right.

Just remember, the final cost of a route we calculate is equivalent to the money you actually spend + the money you need to spend to buy back the store credit lost due to purchasing CCUs from third parties. If you don't want store credit, just set this value to 0.

Oh, I almost forgot to mention, you can set the cost of purchasing your starting ship in the panel on the right. This will help to better calculate the total value of the entire chain.

## Can I see my buy-back pledges/ships/ship packages in my hangar and incorporate them into the CCU chain construction?

Working on it, will be supported in the future.
