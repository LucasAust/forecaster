from pathlib import Path

path = Path(r"c:\code\forecaster\backtest_forecast.py")
marker = "if __name__ == \"__main__\":\n    main()\n"
content = path.read_text()
index = content.find(marker)
if index != -1:
    path.write_text(content[: index + len(marker)])
