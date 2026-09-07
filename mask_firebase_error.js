const fs = require('fs');
const file = '/app/applet/artifacts/gold-swing-ai/src/pages/login.tsx';
let content = fs.readFileSync(file, 'utf8');

const target = `} catch (err: any) {
      console.error(err);
      setIsLoggingIn(false);
      setErrorMsg(err.message || "Failed to log in. Please try again.");
    }`;

const replacement = `} catch (err: any) {
      console.error(err);
      setIsLoggingIn(false);
      let message = err.message || "Failed to log in. Please try again.";
      // Mask Firebase terminology
      if (message.includes("auth/unauthorized-domain")) {
        message = "Login blocked: This application URL is not authorized for sign-in.";
      } else if (message.includes("Firebase")) {
        message = "An authentication error occurred. Please try again.";
      }
      setErrorMsg(message);
    }`;

content = content.replace(target, replacement);
fs.writeFileSync(file, content);
console.log("Masked Firebase errors in login.tsx");
