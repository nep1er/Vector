import logoUrl from '../../../resources/brand/logo.png';

/** Логотип берётся из resources/brand/logo.png — достаточно заменить файл. */
export default function Logo({ height = 32 }: { height?: number }) {
  return <img className="logo" src={logoUrl} alt="Vector" style={{ height }} />;
}
