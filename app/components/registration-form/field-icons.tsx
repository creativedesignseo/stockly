/**
 * Map FieldType -> Polaris icon for the field list and type picker.
 */
import {
  TextIcon,
  EmailIcon,
  LockIcon,
  PhoneIcon,
  SelectIcon,
  GlobeIcon,
  NoteIcon,
} from "@shopify/polaris-icons";

import type { FieldType } from "../../lib/registration-form-types";

export const FIELD_ICON: Record<FieldType, typeof TextIcon> = {
  text: TextIcon,
  email: EmailIcon,
  password: LockIcon,
  phone: PhoneIcon,
  select: SelectIcon,
  country: GlobeIcon,
  textarea: NoteIcon,
};

export const FIELD_TYPE_LABEL: Record<FieldType, string> = {
  text: "Text",
  email: "Email",
  password: "Password",
  phone: "Phone",
  select: "Select",
  country: "Country",
  textarea: "Text area",
};
