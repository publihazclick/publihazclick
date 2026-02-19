import { importProvidersFrom } from '@angular/core';
import { LucideAngularModule, icons } from 'lucide-angular';

/**
 * Proveedor de iconos Lucide para la aplicación
 * Nota: Los nombres de iconos con guiones se convierten a camelCase
 * Ejemplo: trending-up -> trendingUp, log-in -> logIn
 */
export const provideLucideIcons = () => {
  return importProvidersFrom(
    LucideAngularModule.pick({
      // Iconos de autenticación
      Mail: icons.Mail,
      Lock: icons.Lock,
      LockOpen: icons.LockOpen,
      Eye: icons.Eye,
      EyeOff: icons.EyeOff,
      User: icons.User,
      UserPlus: icons.UserPlus,
      LogIn: icons.LogIn,
      LogOut: icons.LogOut,

      // Iconos de navegación
      Menu: icons.Menu,
      X: icons.X,
      Search: icons.Search,
      TrendingUp: icons.TrendingUp,

      // Iconos de acciones
      Check: icons.Check,
      Circle: icons.Circle,
      Info: icons.Info,

      // Iconos de UI
      ArrowRight: icons.ArrowRight,
      ArrowLeft: icons.ArrowLeft,
      ArrowUp: icons.ArrowUp,
      ArrowDown: icons.ArrowDown,
      ChevronDown: icons.ChevronDown,
      ChevronUp: icons.ChevronUp,
      ChevronLeft: icons.ChevronLeft,
      ChevronRight: icons.ChevronRight,
      Copy: icons.Copy,
      Download: icons.Download,
      Upload: icons.Upload,
      Settings: icons.Settings,
      Bell: icons.Bell,
      Heart: icons.Heart,
      Star: icons.Star,
      Share: icons.Share,
      Link: icons.Link,
      ExternalLink: icons.ExternalLink,

      // Iconos varios
      Clock: icons.Clock,
      Calendar: icons.Calendar,
      MapPin: icons.MapPin,
      Phone: icons.Phone,
      MessageCircle: icons.MessageCircle,
      Send: icons.Send,
      CreditCard: icons.CreditCard,
      DollarSign: icons.DollarSign,
      ShoppingCart: icons.ShoppingCart,
      Package: icons.Package,
      Box: icons.Box,
      Zap: icons.Zap,
      Layers: icons.Layers,
      List: icons.List,

      // Iconos de edición
      Plus: icons.Plus,
      Minus: icons.Minus,
      RefreshCcw: icons.RefreshCcw,
      RotateCcw: icons.RotateCcw,
      Trash: icons.Trash,
      File: icons.File,
      Folder: icons.Folder,
      Image: icons.Image,
      Camera: icons.Camera,
      Video: icons.Video,
      Music: icons.Music,

      // Iconos de marcas
      Github: icons.Github,
      Apple: icons.Apple,

      // Iconos adicionales
      Loader: icons.Loader,
      Activity: icons.Activity,
      Award: icons.Award,
      Bookmark: icons.Bookmark,
      Briefcase: icons.Briefcase,
      Building: icons.Building,
      Globe: icons.Globe,
      Map: icons.Map,
      Printer: icons.Printer,
      Save: icons.Save,
      Shield: icons.Shield,
      ShieldCheck: icons.ShieldCheck,
      Target: icons.Target,
      Users: icons.Users,
      Wrench: icons.Wrench,
      LayoutDashboard: icons.LayoutDashboard,
      FileText: icons.FileText,
      ChartBar: icons.ChartBar,
      Terminal: icons.Terminal,
      Megaphone: icons.Megaphone,

      // Iconos para el dashboard de usuario
      Wallet: icons.Wallet,
      MousePointerClick: icons.MousePointerClick,
      History: icons.History,
      TrendingDown: icons.TrendingDown,
      Gift: icons.Gift,
      Sparkles: icons.Sparkles,
      Play: icons.Play,
      ArrowUpRight: icons.ArrowUpRight,
    })
  );
};
