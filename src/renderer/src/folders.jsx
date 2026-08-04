import { Folder, Video, ShieldOff, MonitorPlay, Mail, Globe, Star, Boxes, Film, Rocket } from "lucide-react";

const MAP = {
  folder: Folder, video: Video, shield: ShieldOff, monitor: MonitorPlay,
  mail: Mail, globe: Globe, star: Star, film: Film, rocket: Rocket,
};

export const ICON_KEYS = Object.keys(MAP);
export const ALL_FOLDER = { key: "all", name: "Semua Akun", icon: "boxes" };

export function FolderIcon({ name, ...props }) {
  const C = name === "boxes" ? Boxes : MAP[name] || Folder;
  return <C {...props} />;
}
