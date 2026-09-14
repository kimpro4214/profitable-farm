import { SvgXml } from "react-native-svg";

// Exact vector exported from Figma node 121:387. The 18x16.965 leaf sits
// inside the original 19x17.965 SVG bounds.
const kakaoBubbleXml = `<svg preserveAspectRatio="none" overflow="visible" width="19" height="17.965" viewBox="0 0 19 17.965" fill="none" xmlns="http://www.w3.org/2000/svg"><path id="icon-kakao-bubble" d="M9.5 0.5C4.5 0.5 0.5 3.7 0.5 7.6C0.5 10.1 2.2 12.3 4.7 13.5L3.8 17C3.7 17.3 4.1 17.6 4.4 17.4L8.5 14.7C8.8 14.7 9.1 14.7 9.5 14.7C14.5 14.7 18.5 11.5 18.5 7.6C18.5 3.7 14.5 0.5 9.5 0.5Z" fill="#1C1C1C" stroke="black"/></svg>`;

export default function KakaoBubbleIcon() {
  return <SvgXml xml={kakaoBubbleXml} width={19} height={17.965} />;
}
