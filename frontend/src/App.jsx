import { useEffect, useState } from "react";
import axios from "axios";

function App() {
  const [apiData, setApiData] = useState(null);

  useEffect(() => {
    axios.get("http://localhost:3001")
      .then((response) => setApiData(response.data))
      .catch((error) => console.error(error));
  }, []);

  return (
    <div style={{ padding: "40px", textAlign: "center" }}>
      <h1>JobHunter AI</h1>

      {apiData ? (
        <div>
          <h2>{apiData.project}</h2>
          <p>{apiData.message}</p>
          <p>Versao: {apiData.version}</p>
        </div>
      ) : (
        <p>Carregando dados da API...</p>
      )}
    </div>
  );
}

export default App;
