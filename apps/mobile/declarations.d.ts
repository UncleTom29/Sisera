/// <reference types="react" />

declare module "react-native" {
  import * as React from "react";

  export interface ViewStyle {
    [key: string]: any;
  }
  export interface TextStyle {
    [key: string]: any;
  }
  export interface StyleSheet {
    create<T extends Record<string, any>>(styles: T): T;
  }
  export const StyleSheet: StyleSheet;

  export interface ViewProps {
    style?: any;
    children?: React.ReactNode;
  }
  export const View: React.FC<ViewProps>;

  export interface TextProps {
    style?: any;
    children?: React.ReactNode;
    numberOfLines?: number;
  }
  export const Text: React.FC<TextProps>;

  export interface TextInputProps {
    style?: any;
    value?: string;
    onChangeText?: (text: string) => void;
    onSubmitEditing?: () => void;
    placeholder?: string;
    placeholderTextColor?: string;
    keyboardType?: string;
    secureTextEntry?: boolean;
  }
  export const TextInput: React.FC<TextInputProps>;

  export interface TouchableOpacityProps {
    style?: any;
    onPress?: () => void;
    disabled?: boolean;
    children?: React.ReactNode;
  }
  export const TouchableOpacity: React.FC<TouchableOpacityProps>;

  export interface ButtonProps {
    title: string;
    onPress: () => void;
    color?: string;
    disabled?: boolean;
  }
  export const Button: React.FC<ButtonProps>;

  export interface ScrollViewProps extends ViewProps {
    refreshControl?: React.ReactNode;
  }
  export const ScrollView: React.FC<ScrollViewProps>;
  export const SafeAreaView: React.FC<ViewProps>;

  export interface ActivityIndicatorProps {
    size?: "small" | "large" | number;
    color?: string;
    style?: any;
  }
  export const ActivityIndicator: React.FC<ActivityIndicatorProps>;

  export interface ModalProps {
    visible?: boolean;
    transparent?: boolean;
    animationType?: "none" | "slide" | "fade";
    onRequestClose?: () => void;
    children?: React.ReactNode;
  }
  export const Modal: React.FC<ModalProps>;

  export interface RefreshControlProps {
    refreshing: boolean;
    onRefresh?: () => void;
    tintColor?: string;
  }
  export const RefreshControl: React.FC<RefreshControlProps>;

  export interface FlatListProps<T> {
    data: readonly T[] | null | undefined;
    renderItem: (info: { item: T; index: number }) => React.ReactElement | null;
    keyExtractor?: (item: T, index: number) => string;
    refreshControl?: React.ReactElement;
    style?: any;
  }
  export const FlatList: <T>(props: FlatListProps<T>) => React.ReactElement;

  export const Alert: {
    alert: (title: string, message?: string, buttons?: any[]) => void;
  };
}

declare module "expo-router" {
  import * as React from "react";

  export const Tabs: React.FC<any> & {
    Screen: React.FC<any>;
  };

  export const Stack: React.FC<any> & {
    Screen: React.FC<any>;
  };

  export function useRouter(): {
    push: (url: string) => void;
    replace: (url: string) => void;
    back: () => void;
  };
}
