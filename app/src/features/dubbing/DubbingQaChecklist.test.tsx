import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { makeProjectFixture } from '../../test/fixtures'
import { DubbingWorkbenchDatabase, DubbingWorkbenchRepository } from './dubbing-workbench-repository'
import { resolveDubbingSource } from './dubbing-canvas-adapter'
import { DubbingQaChecklist } from './DubbingQaChecklist'
import { DUBBING_QA_CATEGORIES, loadDubbingQaTemplate } from './dubbing-qa-standard'

test('九节清单全勾选门禁、FAIL阻断、原始WARN证据可见；数据弹窗Esc和错误反馈', async () => {
  const db = new DubbingWorkbenchDatabase(`qa-ui-${crypto.randomUUID()}`)
  try {
    const repository = new DubbingWorkbenchRepository(db), project = makeProjectFixture()
    const intake = await repository.intake(resolveDubbingSource(project, { type: 'node', id: 'shot-1' }), { sourceAssetId: 'original', episodeNumber: 1, shotNumber: 1, startMs: 0, endMs: 1000, originalDialogue: '你好', localizedDialogue: 'Hello', framing: '', camera: '' })
    const state = await repository.submit(project.id, intake.workspace.version, intake.shotId), shot = state.shots[0]
    const user = userEvent.setup(), saveEvidence = vi.fn().mockRejectedValue(new Error('检测数据格式无效'))
    const actions = { checkQa: vi.fn(), checkCategories: vi.fn(), saveEvidence, confirm: vi.fn() }
    const view = render(<DubbingQaChecklist workspace={state} shot={shot} busy={false} actions={actions} />)
    for (const category of DUBBING_QA_CATEGORIES) expect(screen.getByRole('group', { name: category === '修改' ? '修改底线' : category })).toBeVisible()
    expect(screen.getAllByRole('checkbox')).toHaveLength(loadDubbingQaTemplate().rules.length + 9)
    expect(screen.getByRole('button', { name: '生成自审确认表' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '填写检测数据' }))
    const dialog = screen.getByRole('dialog', { name: '填写检测数据' })
    await user.clear(within(dialog).getByLabelText('检测数据 JSON'))
    await user.click(within(dialog).getByRole('button', { name: '保存检测数据' }))
    expect(screen.getByRole('alert')).toHaveTextContent('有效 JSON')
    expect(saveEvidence).not.toHaveBeenCalled()
    await user.type(within(dialog).getByLabelText('检测数据 JSON'), '{{}')
    await user.click(within(dialog).getByRole('button', { name: '保存检测数据' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('检测数据格式无效')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '填写检测数据' })).toHaveFocus()
    shot.qa.checkedIds = loadDubbingQaTemplate().rules.map(rule => rule.standardId)
    shot.qa.checkedCategories = [...DUBBING_QA_CATEGORIES]
    view.rerender(<DubbingQaChecklist workspace={state} shot={shot} busy={false} actions={actions} />)
    expect(screen.getByRole('button', { name: '生成自审确认表' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: '生成自审确认表' }))
    expect(actions.confirm).toHaveBeenCalledOnce()
    shot.qa.evidence = { channels: 1 }
    view.rerender(<DubbingQaChecklist workspace={state} shot={shot} busy={false} actions={actions} />)
    expect(screen.getByRole('button', { name: '生成自审确认表' })).toBeDisabled()
    await user.click(screen.getByText(/检查结果与依据/))
    expect(screen.getByText(/声道数 1/)).toBeVisible()
    expect(screen.getAllByText(/AI辅助未执行，待人工确认/).length).toBeGreaterThan(0)
  } finally { await db.delete() }
})
