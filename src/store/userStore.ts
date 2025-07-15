import { UserRole } from "@/types";
import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface User {
  id: string,
  username: string,
  nickname: string,
  avatar: string,
  email: string,
  token: string,
  role: UserRole,
}

const getInitialState = () => {
  const user = localStorage.getItem('user');
  if (user) {
    return {
      user: JSON.parse(user) as User,
    };
  }

  return {
    user: {
      id: '',
      username: '',
      nickname: '',
      avatar: '',
      email: '',
      token: '',
      role: UserRole.Guest,
    } as User,
  }
}

export const userSlice = createSlice({
  name: 'user',
  initialState: getInitialState(),
  reducers: {
    login: (state, action: PayloadAction<User>) => {
      state.user = action.payload;
      localStorage.setItem('user', JSON.stringify(state.user));
    },
    logout: (state) => {
      localStorage.removeItem('user');
      state.user = getInitialState().user;
    },
  }
});

export const { login, logout } = userSlice.actions;
