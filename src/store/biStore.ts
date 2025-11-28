// import { SessionHistory } from '@/types';
// import { createSlice, PayloadAction } from '@reduxjs/toolkit';
// import { RootState } from '.';
// import { BiSlots, getDeviceTag } from '@/report';

// interface BiState {
//   sessionHistories: SessionHistory[],
// }

// const initialState: BiState = {
//   sessionHistories: [],
// };

// export const biSlice = createSlice({
//   name: 'bi',
//   initialState,
//   reducers: {
//     addHistory: (state, action: PayloadAction<{ page: string }>) => {
//       const ts = new Date().getTime()
//       const lastHistory = state.sessionHistories.pop()
//       if (lastHistory) {
//         lastHistory.close = String(ts)
//         state.sessionHistories.push(lastHistory)
//       }
//       state.sessionHistories.push({
//         open: String(ts),
//         page: action.payload.page,
//         close: ""
//       })
//     },
//     handleUnload: (state) => {
//       const ts = new Date().getTime()
//       const lastHistory = state.sessionHistories.pop()
//       if (lastHistory) {
//         lastHistory.close = String(ts)
//         state.sessionHistories.push(lastHistory)
//       }
    
//       const payload = JSON.stringify({
//         deviceTag: getDeviceTag(),
//         data: state.sessionHistories,
//         slot: BiSlots.VIEW_SESSION
//       })
    
//       // 使用 sendBeacon 发送
//       const success = navigator.sendBeacon(`${import.meta.env.VITE_PUBLIC_BI_ENDPOINT}/api/bi/info`, payload)

//       console.log("beacon setup >>>>>", success, payload, `${import.meta.env.VITE_PUBLIC_BI_ENDPOINT}/api/bi/info`)
//     }
//   },
// });

// export const { addHistory, handleUnload } = biSlice.actions;

// export const selectHistories = (state: RootState) => state.bi.sessionHistories;

// export default biSlice.reducer; 