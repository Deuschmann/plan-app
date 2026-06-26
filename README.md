# GitHub Pages 发布说明

这个项目已经配置了 GitHub Pages 自动发布。

发布内容来自：

```text
outputs/plan-app
```

## 第一次上传

当前电脑上的 GitHub CLI 登录状态已失效，需要先重新登录：

```bash
gh auth login -h github.com
```

登录完成后，在项目根目录执行：

```bash
git init
git add .
git commit -m "Initial PWA app"
gh repo create plan-app --private --source=. --remote=origin --push
```

如果想让熟人访问，把仓库设为 public，或者在 GitHub 仓库页面里调整 Pages 访问策略。

## 打开 GitHub Pages

推送后进入 GitHub 仓库：

1. 打开 Settings。
2. 打开 Pages。
3. Source 选择 GitHub Actions。
4. 等 Actions 跑完。
5. 页面会显示一个访问地址，通常类似：

```text
https://你的用户名.github.io/仓库名/
```

## iPhone 使用

1. 用 iPhone 的 Safari 打开 GitHub Pages 地址。
2. 点击分享按钮。
3. 选择“添加到主屏幕”。
4. 之后就可以像 App 一样从桌面打开。

## 注意

- 这是 PWA，不需要 Xcode。
- 每台手机的数据保存在各自浏览器/主屏幕 App 里。
- 换手机不会自动同步，后续需要后端登录和云同步才可以。
