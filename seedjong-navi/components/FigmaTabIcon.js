import { SvgXml } from "react-native-svg";

const iconXml = {
  home: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 0L16 7V14.8C16 15.6 15.6 16 14.8 16H1.2C0.4 16 0 15.6 0 14.8V7L8 0Z" fill="#1C2530"/></svg>`,
  recommend: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8.25 18C7.91667 18 7.75 17.8333 7.75 17.5V10H10.25V17.5C10.25 17.8333 10.0833 18 9.75 18H8.25ZM9 10C7.98 4.88 4.98 1.54667 0 0C1.02 5.12 4.02 8.45333 9 10ZM9 10C13.98 8.45333 16.98 5.12 18 0C13.02 1.54667 10.02 4.88 9 10Z" fill="#8A8F98"/></svg>`,
  calculator: `<svg width="14" height="16" viewBox="0 0 14 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M1.2 0H12.8C13.6 0 14 0.4 14 1.2V14.8C14 15.6 13.6 16 12.8 16H1.2C0.4 16 0 15.6 0 14.8V1.2C0 0.4 0.4 0 1.2 0ZM2.5 2H11.5V5H2.5V2ZM2.5 6.5H5.5V8.5H2.5V6.5ZM8.5 6.5H11.5V8.5H8.5V6.5ZM2.5 9.5H5.5V11.5H2.5V9.5ZM8.5 9.5H11.5V11.5H8.5V9.5ZM2.5 12.5H5.5V14.5H2.5V12.5ZM8.5 12.5H11.5V14.5H8.5V12.5Z" fill="#8A8F98"/></svg>`,
  diary: `<svg width="14" height="16" viewBox="0 0 14 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M1.2 0H12.8C13.6 0 14 0.4 14 1.2V14.8C14 15.6 13.6 16 12.8 16H1.2C0.4 16 0 15.6 0 14.8V1.2C0 0.4 0.4 0 1.2 0ZM2 4H12V5.2H2V4ZM2 8H12V9.2H2V8ZM2 12H10V13.2H2V12Z" fill="#8A8F98"/></svg>`,
  community: `<svg width="19" height="19" viewBox="0 0 19 19" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1.62857 0H17.3714C18.4571 0 19 0.506667 19 1.52V11.1467C19 12.16 18.4571 12.6667 17.3714 12.6667H8.14286L4.75 19L2.71429 12.6667H1.08571C0.361905 12.6667 0 12.16 0 11.1467V1.52C0 0.506667 0.542857 0 1.62857 0Z" fill="#8A8F98"/></svg>`,
};

export default function FigmaTabIcon({ name, active = false }) {
  const dimensions = { home: [16, 16], recommend: [18, 18], calculator: [14, 16], diary: [14, 16], community: [19, 19] };
  const [width, height] = dimensions[name];
  const fill = active ? "#1C2530" : "#8A8F98";
  const xml = iconXml[name].replace(/fill="#[0-9A-Fa-f]{6}"/g, `fill="${fill}"`);
  return <SvgXml xml={xml} width={width} height={height} />;
}
