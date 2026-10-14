import type { ComponentType, Dispatch, SetStateAction } from "react";
import type { ImageStyle, TextInputProps, TextStyle, ViewStyle } from "react-native";

export type AppStyle = ViewStyle & TextStyle & ImageStyle;
export type AppStyles = Record<string, AppStyle>;

export type FieldProps = {
  label: string;
  testID?: string;
  value: string;
  onChangeText: (value: string) => void;
  multiline?: boolean;
  placeholder?: string;
  secureTextEntry?: boolean;
  autoCapitalize?: TextInputProps["autoCapitalize"];
  keyboardType?: TextInputProps["keyboardType"];
  editable?: boolean;
};

export type FieldComponent = ComponentType<FieldProps>;

export type SegmentButtonComponent = ComponentType<{
  label: string;
  active: boolean;
  onPress: () => void;
}>;

export type StateSetter<T> = Dispatch<SetStateAction<T>>;
