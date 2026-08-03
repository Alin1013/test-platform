import { Avatar } from 'antd';

const avatarColors = ['#2b74b8', '#2f9b83', '#bd7f28', '#7c62aa'];

interface PersonAvatarProps {
  name: string;
  src?: string;
  size?: number | 'small' | 'default' | 'large';
}

export function PersonAvatar({ name, src, size = 'default' }: PersonAvatarProps) {
  const colorIndex = Array.from(name).reduce((sum, character) => sum + character.charCodeAt(0), 0);
  const initial = Array.from(name.trim())[0] ?? '用';

  return (
    <Avatar
      size={size}
      src={src}
      style={{ backgroundColor: avatarColors[colorIndex % avatarColors.length] }}
    >
      {initial}
    </Avatar>
  );
}
