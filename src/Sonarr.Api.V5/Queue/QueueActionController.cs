using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using NzbDrone.Core.Download;
using NzbDrone.Core.Download.Pending;
using NzbDrone.Core.Download.TrackedDownloads;
using NzbDrone.Core.Messaging.Commands;
using NzbDrone.Core.Queue;
using Sonarr.Http;
using Sonarr.Http.REST;

namespace Sonarr.Api.V5.Queue
{
    [V5ApiController("queue")]
    public class QueueActionController : Controller
    {
        private readonly IPendingReleaseService _pendingReleaseService;
        private readonly IDownloadService _downloadService;
        private readonly IQueueService _queueService;
        private readonly ITrackedDownloadService _trackedDownloadService;
        private readonly IProvideDownloadClient _downloadClientProvider;
        private readonly IManageCommandQueue _commandQueueManager;

        public QueueActionController(IPendingReleaseService pendingReleaseService,
                                     IDownloadService downloadService,
                                     IQueueService queueService,
                                     ITrackedDownloadService trackedDownloadService,
                                     IProvideDownloadClient downloadClientProvider,
                                     IManageCommandQueue commandQueueManager)
        {
            _pendingReleaseService = pendingReleaseService;
            _downloadService = downloadService;
            _queueService = queueService;
            _trackedDownloadService = trackedDownloadService;
            _downloadClientProvider = downloadClientProvider;
            _commandQueueManager = commandQueueManager;
        }

        [HttpPost("grab/{id:int}")]
        public async Task<Results<NoContent, NotFound>> Grab([FromRoute] int id)
        {
            var pendingRelease = _pendingReleaseService.FindPendingQueueItem(id);

            if (pendingRelease == null)
            {
                throw new NotFoundException();
            }

            await _downloadService.DownloadReport(pendingRelease.RemoteEpisode, null);

            return TypedResults.NoContent();
        }

        [HttpPost("grab/bulk")]
        [Consumes("application/json")]
        public async Task<Results<NoContent, NotFound>> Grab([FromBody] QueueBulkResource resource)
        {
            foreach (var id in resource.Ids)
            {
                var pendingRelease = _pendingReleaseService.FindPendingQueueItem(id);

                if (pendingRelease == null)
                {
                    throw new NotFoundException();
                }

                await _downloadService.DownloadReport(pendingRelease.RemoteEpisode, null);
            }

            return TypedResults.NoContent();
        }

        [HttpPost("resume/{id:int}")]
        public Results<NoContent, NotFound> Resume([FromRoute] int id)
        {
            var queueItem = _queueService.Find(id);

            if (queueItem == null)
            {
                throw new NotFoundException($"Queue item with ID {id} does not exist.");
            }

            var trackedDownload = _trackedDownloadService.Find(queueItem.DownloadId);

            if (trackedDownload == null)
            {
                throw new NotFoundException($"Tracked download with ID {queueItem.DownloadId} does not exist.");
            }

            ResumeTrackedDownload(trackedDownload, queueItem);
            _commandQueueManager.Push(new RefreshMonitoredDownloadsCommand());

            return TypedResults.NoContent();
        }

        [HttpPost("resume/bulk")]
        [Consumes("application/json")]
        public NoContent Resume([FromBody] QueueBulkResource resource)
        {
            var resumedDownloadIds = new HashSet<string>();

            foreach (var id in resource.Ids)
            {
                var queueItem = _queueService.Find(id);

                if (queueItem == null)
                {
                    continue;
                }

                var trackedDownload = _trackedDownloadService.Find(queueItem.DownloadId);

                if (trackedDownload == null)
                {
                    continue;
                }

                if (resumedDownloadIds.Add(trackedDownload.DownloadItem.DownloadId))
                {
                    ResumeTrackedDownload(trackedDownload, queueItem);
                }
                else
                {
                    queueItem.Status = QueueStatus.Queued;
                }
            }

            if (resumedDownloadIds.Count > 0)
            {
                _commandQueueManager.Push(new RefreshMonitoredDownloadsCommand());
            }

            return TypedResults.NoContent();
        }

        private void ResumeTrackedDownload(TrackedDownload trackedDownload, NzbDrone.Core.Queue.Queue queueItem)
        {
            var downloadClient = _downloadClientProvider.Get(trackedDownload.DownloadClient);

            if (downloadClient == null)
            {
                throw new BadRequestException();
            }

            downloadClient.ResumeItem(trackedDownload.DownloadItem);
            trackedDownload.DownloadItem.Status = DownloadItemStatus.Queued;
            queueItem.Status = QueueStatus.Queued;
        }
    }
}
