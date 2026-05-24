import { UserRole } from "@/types";
import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface User {
  id: string,
  username: string,
  nickname: string,
  avatar: string,
  email: string,
  emailVerified: boolean,
  token: string,
  role: UserRole,
}

const guestUser: User = {
  id: '',
  username: '',
  nickname: '',
  avatar: '',
  email: '',
  emailVerified: false,
  token: '',
  role: UserRole.Guest,
};

const getInitialState = () => {
  const user = localStorage.getItem('user');
  if (user) {
    const parsedUser = JSON.parse(user) as Partial<User>;
    return {
      user: {
        ...guestUser,
        ...parsedUser,
        emailVerified: Boolean(parsedUser.emailVerified),
      },
    };
  }

  return {
    user: guestUser,
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

export default userSlice.reducer
