package main

import (
	"encoding/json"
	"math"
	"syscall/js"
	"time"
)

type WasmNode struct {
	ID     string `json:"id"`
	ShipID string `json:"shipId"`
}

type WasmEdge struct {
	SourceNodeID    string  `json:"sourceNodeId"`
	SourceShipID    string  `json:"sourceShipId"`
	TargetNodeID    string  `json:"targetNodeId"`
	USDPrice        float64 `json:"usdPrice"`
	TPPrice         float64 `json:"tpPrice"`
	IsUsedUp        bool    `json:"isUsedUp"`
	AllowUsedUpEdge bool    `json:"allowUsedUpEdge"`
}

type WasmStart struct {
	NodeID  string  `json:"nodeId"`
	USDCost float64 `json:"usdCost"`
	TPCost  float64 `json:"tpCost"`
}

type WasmRequest struct {
	Nodes          []WasmNode  `json:"nodes"`
	Edges          []WasmEdge  `json:"edges"`
	Starts         []WasmStart `json:"starts"`
	EndShipID      string      `json:"endShipId"`
	ExchangeRate   float64     `json:"exchangeRate"`
	ConciergeValue float64     `json:"conciergeValue"`
	PruneOpt       bool        `json:"pruneOpt"`
}

type SearchStats struct {
	Expanded int `json:"expanded"`
	Pruned   int `json:"pruned"`
	Returned int `json:"returned"`
}

type WasmResponse struct {
	Paths     [][]string  `json:"paths,omitempty"`
	ElapsedMs float64     `json:"elapsedMs"`
	Stats     SearchStats `json:"stats"`
	Error     string      `json:"error,omitempty"`
}

func calculateTotalCost(usdPrice float64, thirdPartyPrice float64, exchangeRate float64, conciergeValue float64) float64 {
	return usdPrice*exchangeRate + thirdPartyPrice*(1+conciergeValue)
}

func cloneVisited(source map[string]bool) map[string]bool {
	target := make(map[string]bool, len(source))
	for key, value := range source {
		target[key] = value
	}
	return target
}

func searchPaths(req WasmRequest) WasmResponse {
	resp := WasmResponse{
		Paths: make([][]string, 0, 64),
	}

	if len(req.Nodes) == 0 || len(req.Starts) == 0 || req.EndShipID == "" {
		return resp
	}

	conciergeValue := req.ConciergeValue
	if math.IsNaN(conciergeValue) || math.IsInf(conciergeValue, 0) {
		conciergeValue = 0
	}

	exchangeRate := req.ExchangeRate
	if math.IsNaN(exchangeRate) || math.IsInf(exchangeRate, 0) {
		exchangeRate = 1
	}

	nodesByID := make(map[string]WasmNode, len(req.Nodes))
	for _, node := range req.Nodes {
		nodesByID[node.ID] = node
	}

	edgesBySourceShipID := make(map[string][]WasmEdge, len(req.Edges))
	for _, edge := range req.Edges {
		edgesBySourceShipID[edge.SourceShipID] = append(edgesBySourceShipID[edge.SourceShipID], edge)
	}

	bestCostByNodeID := make(map[string]float64, len(req.Nodes))

	var dfs func(nodeID string, visited map[string]bool, path []string, usdCost float64, tpCost float64)
	dfs = func(nodeID string, visited map[string]bool, path []string, usdCost float64, tpCost float64) {
		node, exists := nodesByID[nodeID]
		if !exists {
			return
		}

		nextVisited := cloneVisited(visited)
		nextVisited[nodeID] = true

		// Keep each recursion branch isolated to match JS `[...currentPath]` behavior.
		nextPath := append(append(make([]string, 0, len(path)+1), path...), nodeID)
		totalCost := calculateTotalCost(usdCost, tpCost, exchangeRate, conciergeValue)

		if req.PruneOpt {
			if bestCost, ok := bestCostByNodeID[nodeID]; ok && totalCost >= bestCost {
				resp.Stats.Pruned++
				return
			}
		}

		bestCostByNodeID[nodeID] = totalCost

		if node.ShipID == req.EndShipID {
			resp.Paths = append(resp.Paths, nextPath)
			resp.Stats.Returned++
			return
		}

		resp.Stats.Expanded++
		for _, edge := range edgesBySourceShipID[node.ShipID] {
			if edge.IsUsedUp && !edge.AllowUsedUpEdge {
				continue
			}

			targetNode, ok := nodesByID[edge.TargetNodeID]
			if !ok {
				continue
			}

			if nextVisited[targetNode.ID] {
				continue
			}

			childPath := append(make([]string, 0, len(nextPath)), nextPath...)
			dfs(targetNode.ID, nextVisited, childPath, usdCost+edge.USDPrice, tpCost+edge.TPPrice)
		}
	}

	for _, start := range req.Starts {
		if _, exists := nodesByID[start.NodeID]; !exists {
			continue
		}
		dfs(start.NodeID, map[string]bool{}, make([]string, 0, 16), start.USDCost, start.TPCost)
	}

	return resp
}

func makeErrorResponse(errMsg string) string {
	payload, _ := json.Marshal(WasmResponse{Error: errMsg})
	return string(payload)
}

func findAllPathsHandler(_ js.Value, args []js.Value) any {
	if len(args) < 1 {
		return makeErrorResponse("missing request payload")
	}

	var req WasmRequest
	if err := json.Unmarshal([]byte(args[0].String()), &req); err != nil {
		return makeErrorResponse("invalid request payload")
	}

	startedAt := time.Now()
	resp := searchPaths(req)
	resp.ElapsedMs = float64(time.Since(startedAt).Microseconds()) / 1000

	payload, err := json.Marshal(resp)
	if err != nil {
		return makeErrorResponse("failed to marshal response")
	}

	return string(payload)
}

func main() {
	js.Global().Set("ccuFindAllPaths", js.FuncOf(findAllPathsHandler))
	select {}
}
