import { Moon, Sun } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useTheme } from "@/components/theme-provider"

export function ModeToggle() {
  const { theme, setTheme } = useTheme()

  const toggleTheme = () => {
    if (theme === "light") {
      setTheme("dark")
    } else if (theme === "dark") {
      setTheme("system")
    } else {
      setTheme("light")
    }
  }

  return (
    <Button variant="ghost" size="icon" onClick={toggleTheme} className="h-8 w-8 text-muted-foreground hover:text-foreground">
      {theme === "light" && <Sun className="h-[1.2rem] w-[1.2rem] transition-all" />}
      {theme === "dark" && <Moon className="h-[1.2rem] w-[1.2rem] transition-all" />}
      {theme === "system" && <div className="flex relative h-[1.2rem] w-[1.2rem]"><Sun className="absolute h-4 w-4 scale-100 transition-all dark:scale-0" /><Moon className="absolute h-4 w-4 scale-0 transition-all dark:scale-100" /></div>}
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}
