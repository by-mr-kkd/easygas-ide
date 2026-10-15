/** A picture the AI made for the share page / a social post (components/ide/ShareKit.tsx), kept in the store for this page session. */
export type KitPicture = {
  id: string;
  /** JPEG data URL, already cropped to the box picked (lib/share/picture-prompt PICTURE_SIZES) */
  dataUrl: string;
  width: number;
  height: number;
  at: number;
  /** who made it and how, for the caption under the picture */
  by: string;
};
