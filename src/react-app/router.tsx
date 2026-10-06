import { createBrowserRouter } from "react-router";
import { HelloPage } from "./features/hello/HelloPage";

export const router = createBrowserRouter([{ path: "/", element: <HelloPage /> }]);
